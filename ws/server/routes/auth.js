const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;


// Initialize Cloudinary with error handling
try {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });

    // Verify configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY || 
        !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Missing Cloudinary credentials');
    }

    console.log('Cloudinary configured successfully');
} catch (error) {
    console.error('Cloudinary configuration error:', error.message);
    // Don't throw the error, let the application continue but log the issue
}

// Configure Multer for memory storage
const upload = multer({
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB limit
    }
});
// Auth middleware
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// Register User
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        
        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create new user
        user = new User({
            name,
            email,
            password,
            phone
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        // Create token
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// Login User
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during login' });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: '10m'
        });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            to: email,
            subject: 'Password Reset',
            html: `Click here to reset your password: ${process.env.CLIENT_URL}/reset-password/${resetToken}`
        });

        res.json({ message: 'Password reset email sent' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during password reset' });
    }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/update-profile', auth, async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        
        // Check if email is already taken by another user
        if (email) {
            const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Email is already in use' });
            }
        }

        // Update user profile
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (phone) updateData.phone = phone;
        if (address) updateData.address = address;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateData },
            { new: true }
        ).select('-password');

        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during profile update' });
    }
});

// Change password
router.put('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user with password
        const user = await User.findById(req.user.id);

        // Check current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during password change' });
    }
});

// Reset password with token
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { password } = req.body;
        const { token } = req.params;

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        res.json({ message: 'Password has been reset successfully' });
    } catch (err) {
        console.error(err.message);
        if (err.name === 'JsonWebTokenError') {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        res.status(500).json({ message: 'Server error during password reset' });
    }
});

// Delete account
router.delete('/delete-account', auth, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.user.id);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during account deletion' });
    }
});



// image upload
router.post('/upload-avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            throw new Error('Cloudinary configuration is missing');
        }

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'avatars',
                    transformation: [
                        { width: 250, height: 250, crop: 'fill' },
                        { quality: 'auto' }
                    ]
                },
                (error, result) => {
                    if (error) {
                        console.error('Cloudinary upload error:', error);
                        reject(new Error('Failed to upload image to cloud storage'));
                    } else {
                        resolve(result);
                    }
                }
            );

            uploadStream.end(req.file.buffer);
        });

        // Update user's avatar URL in database
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: { avatar: result.secure_url } },
            { new: true }
        ).select('-password');

        if (!user) {
            throw new Error('User not found');
        }

        res.json({
            message: 'Avatar uploaded successfully',
            avatar: result.secure_url
        });
    } catch (err) {
        console.error('Avatar upload error:', err);
        res.status(500).json({ 
            message: 'Failed to upload avatar', 
            error: err.message 
        });
    }
});


// Delete avatar
router.delete('/delete-avatar', auth, async (req, res) => {
    try {
        // Get current user to check if they have an avatar
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user's avatar URL to empty string
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: { avatar: '' } },
            { new: true }
        ).select('-password');

        res.json({
            message: 'Avatar deleted successfully',
            user: updatedUser
        });
    } catch (err) {
        console.error('Avatar deletion error:', err);
        res.status(500).json({ 
            message: 'Failed to delete avatar', 
            error: err.message 
        });
    }
});

module.exports = router;