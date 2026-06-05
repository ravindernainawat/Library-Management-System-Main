const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Reservation = require("../models/Reservation");
const Exchange = require("../models/Exchange");
const Account = require("../models/Account");
const Request = require("../models/Request");
const { verifyToken, verifyAdmin } = require("../middleware/auth");
const { calcFine } = require("../utils");

// GET all library statistics and analytics data
router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [
      summaryStats,
      userRoles,
      fineStats,
      popularBooks,
      categoryStats,
      categoryBorrows,
      monthlyIssues,
      monthlyReturns,
      monthlyNewUsers,
      activeReaders,
      leaderboardUsers,
      overdueTrend
    ] = await Promise.all([
      // 1. Book summary: Total unique books, total copies, available copies
      Book.aggregate([
        {
          $group: {
            _id: null,
            totalBooks: { $sum: 1 },
            totalCopies: { $sum: "$totalCopies" },
            availableCopies: { $sum: "$availableCopies" }
          }
        }
      ]),
      // 2. User segmentation by role
      User.aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 }
          }
        }
      ]),
      // 3. Fines tracking sum by status
      Transaction.aggregate([
        {
          $group: {
            _id: "$fineStatus",
            total: { $sum: "$totalFine" }
          }
        }
      ]),
      // 4. Popular Books: Top 10 books by total borrow transactions
      Transaction.aggregate([
        { $group: { _id: "$bookId", borrowCount: { $sum: 1 } } },
        { $sort: { borrowCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "books",
            localField: "_id",
            foreignField: "_id",
            as: "book"
          }
        },
        { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            bookId: "$_id",
            borrowCount: 1,
            title: { $ifNull: ["$book.title", "Deleted Book"] },
            author: { $ifNull: ["$book.author", "Unknown"] },
            category: { $ifNull: ["$book.category", "Uncategorized"] }
          }
        }
      ]),
      // 5. Category distribution: Books per category
      Book.aggregate([
        {
          $group: {
            _id: "$category",
            bookCount: { $sum: 1 },
            totalCopies: { $sum: "$totalCopies" }
          }
        },
        { $sort: { bookCount: -1 } }
      ]),
      // 6. Category Borrows: Borrows per category
      Transaction.aggregate([
        {
          $lookup: {
            from: "books",
            localField: "bookId",
            foreignField: "_id",
            as: "book"
          }
        },
        { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ["$book.category", "Uncategorized"] },
            borrowCount: { $sum: 1 }
          }
        },
        { $sort: { borrowCount: -1 } }
      ]),
      // 7. Monthly borrowing trend (issues) for last 12 months
      Transaction.aggregate([
        {
          $match: {
            issueDate: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$issueDate" },
              month: { $month: "$issueDate" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]),
      // 8. Monthly borrowing trend (returns) for last 12 months
      Transaction.aggregate([
        {
          $match: {
            returnDate: { $ne: null, $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$returnDate" },
              month: { $month: "$returnDate" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]),
      // 9. Monthly new user signups for last 12 months
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]),
      // 10. Top 10 most active readers
      Transaction.aggregate([
        {
          $group: {
            _id: "$userId",
            userName: { $first: "$userName" },
            userRole: { $first: "$userRole" },
            borrowCount: { $sum: 1 }
          }
        },
        { $sort: { borrowCount: -1 } },
        { $limit: 10 }
      ]),
      // 11. Top leaderboard gamification points accounts
      Account.find({ role: { $in: ["student", "teacher"] } })
        .sort({ points: -1 })
        .limit(10)
        .select("name email role points readingStreak profilePicture"),
      // 12. Overdue trend (overdue active loans grouped by month)
      Transaction.aggregate([
        {
          $match: {
            status: "issued",
            dueDate: { $lt: new Date() }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: "$dueDate" },
              month: { $month: "$dueDate" }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ])
    ]);

    // Independent collections queries for real-time validation checks
    const totalUsers = await User.countDocuments();
    const issuedBooks = await Transaction.countDocuments({ status: "issued" });
    const activeReservations = await Reservation.countDocuments({ status: { $in: ["waiting", "notified"] } });
    const activeExchanges = await Exchange.countDocuments({ status: { $in: ["pending", "accepted", "approved"] } });
    const totalOverdue = await Transaction.countDocuments({ status: "issued", dueDate: { $lt: new Date() } });

    // Format stats response payload securely
    const bSum = summaryStats[0] || { totalBooks: 0, totalCopies: 0, availableCopies: 0 };
    
    const rolesMap = { student: 0, teacher: 0, admin: 0, owner: 0 };
    userRoles.forEach(r => {
      if (r._id && rolesMap[r._id] !== undefined) rolesMap[r._id] = r.count;
    });

    const finesMap = { none: 0, unpaid: 0, paid: 0 };
    fineStats.forEach(f => {
      if (f._id && finesMap[f._id] !== undefined) finesMap[f._id] = f.total;
    });

    const summary = {
      totalBooks: bSum.totalBooks || 0,
      totalCopies: bSum.totalCopies || 0,
      availableCopies: bSum.availableCopies || 0,
      issuedBooks,
      totalUsers,
      students: rolesMap.student,
      teachers: rolesMap.teacher,
      admins: rolesMap.admin + rolesMap.owner,
      activeReservations,
      activeExchanges,
      totalFines: finesMap.unpaid + finesMap.paid,
      collectedFines: finesMap.paid,
      unpaidFines: finesMap.unpaid,
      totalOverdue
    };

    // Construct 12 months array (ensures months with 0 items are populated)
    const monthsList = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      monthsList.push({
        key: `${y}-${m}`,
        year: y,
        month: parseInt(m),
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        issues: 0,
        returns: 0,
        newUsers: 0
      });
    }

    monthlyIssues.forEach(item => {
      const match = monthsList.find(x => x.year === item._id.year && x.month === item._id.month);
      if (match) match.issues = item.count;
    });

    monthlyReturns.forEach(item => {
      const match = monthsList.find(x => x.year === item._id.year && x.month === item._id.month);
      if (match) match.returns = item.count;
    });

    monthlyNewUsers.forEach(item => {
      const match = monthsList.find(x => x.year === item._id.year && x.month === item._id.month);
      if (match) match.newUsers = item.count;
    });

    // Format overdue trend
    const overdueTrendFormatted = overdueTrend.map(item => {
      const d = new Date(item._id.year, item._id.month - 1, 1);
      return {
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        count: item.count
      };
    });

    res.json({
      success: true,
      summary,
      popularBooks,
      categoryStats: {
        booksPerCategory: categoryStats.map(c => ({ category: c._id, count: c.bookCount, copies: c.totalCopies })),
        borrowsPerCategory: categoryBorrows.map(c => ({ category: c._id, count: c.borrowCount }))
      },
      monthlyAnalytics: monthsList,
      userAnalytics: {
        activeReaders: activeReaders.map(r => ({ userName: r.userName || "Unknown", userRole: r.userRole || "student", count: r.borrowCount })),
        leaderboardUsers
      },
      overdueAnalytics: {
        totalOverdue,
        trend: overdueTrendFormatted
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
