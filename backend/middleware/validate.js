const Joi = require('joi');

const passwordComplexity = Joi.string()
  .min(8)
  .pattern(new RegExp('(?=.*[a-z])'))
  .pattern(new RegExp('(?=.*[A-Z])'))
  .pattern(new RegExp('(?=.*[0-9])'))
  .pattern(new RegExp('(?=.*[!@#$%^&*])'))
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long.',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*).'
  });

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: passwordComplexity,
  role: Joi.string().valid('owner', 'admin', 'teacher', 'student').required(),
  otp: Joi.string().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  role: Joi.string().valid('owner', 'admin', 'teacher', 'student').required()
});

const validateRegister = (req, res, next) => {
  const { error } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  
  const { email, role } = req.body;
  if (role !== 'owner' && email && !email.toLowerCase().endsWith('@krmu.edu.in')) {
    return res.status(400).json({ success: false, message: "Registration is restricted to college email addresses (@krmu.edu.in)." });
  }
  
  next();
};

const validateLogin = (req, res, next) => {
  const { error } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

module.exports = { validateRegister, validateLogin };
