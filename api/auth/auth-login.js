import { User } from '../../models/user.js';
import dbConnect from '../db/db-connect.js';
import TwoFAService from '../../services/TwoFAService.js';

const loginHandler = async (req, res) => {
  try {
    const { email, password } = req.body;
    await dbConnect();
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Instead of issuing token immediately, require 2FA verification.
    // Send a 2FA code to the user's email and return a twoFA-required response.
    await TwoFAService.send2FACode({ userOrId: user });
    res.status(200).json({
      success: true,
      twoFA: true,
      message: '2FA code sent',
      user: {
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error during login' 
    });
  }
};

export default loginHandler;