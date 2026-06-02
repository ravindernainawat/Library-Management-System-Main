/**
 * Pagination Utility Middleware
 * Standardizes pagination across all list endpoints
 */

function parsePaginationParams(req) {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 20;

  // Validation: page must be >= 1
  if (page < 1) page = 1;

  // Validation: limit must be between 1 and 100
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  return { page, limit };
}

function buildPaginationResponse(data, totalRecords, page, limit) {
  const totalPages = Math.ceil(totalRecords / limit);

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Calculate skip value for MongoDB
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Records per page
 * @returns {number} - Skip value for MongoDB
 */
function getSkipValue(page, limit) {
  return (page - 1) * limit;
}

module.exports = { parsePaginationParams, buildPaginationResponse, getSkipValue };
