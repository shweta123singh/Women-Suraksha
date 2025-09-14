const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

// Admin middleware
const adminAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const admin = await Admin.findById(decoded.id);
        
        if (!admin || admin.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized as admin' });
        }

        req.admin = admin;
        next();
    } catch (err) {
        console.error('Auth error:', err);
        res.status(401).json({ message: 'Token is not valid' });
    }
};
// Add this route after the existing routes
// Admin Signup
router.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if admin already exists
        let admin = await Admin.findOne({ $or: [{ email }, { username }] });
        if (admin) {
            return res.status(400).json({ 
                message: 'Admin with this email or username already exists' 
            });
        }

        // Create new admin
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        admin = new Admin({
            username,
            email,
            password: hashedPassword,
            role: 'admin'
        });

        await admin.save();

        res.status(201).json({ message: 'Admin account created successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during admin signup' });
    }
});
// Admin Login
// Admin Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Update last login time
        await admin.updateLastLogin();

        const token = jwt.sign(
            { id: admin._id, role: admin.role },
            process.env.JWT_SECRET, // Use environment variable
            { expiresIn: '24h' }
        );

        res.json({
            token,
            admin: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during admin login' });
    }
});

// Get all users
// Update the users route to include more details and error handling
router.get('/users', adminAuth, async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .populate('emergencyContacts')
            .sort({ createdAt: -1 });

        const formattedUsers = users.map(user => ({
            _id: user._id,
            name: user.name || 'N/A',
            email: user.email,
            phone: user.phone || 'N/A',
            status: user.status || 'inactive',
            lastActive: user.lastActive || user.createdAt,
            createdAt: user.createdAt,
            avatar: user.avatar || '',
            emergencyContacts: user.emergencyContacts || []
        }));

        res.json(formattedUsers);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Error fetching users' });
    }
});


// Get user details
router.get('/user/:userId', adminAuth, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-password')
            .populate('emergencyContacts');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Format the response
        const userResponse = {
            _id: user._id,
            name: user.name || 'N/A',
            email: user.email,
            phone: user.phone || 'N/A',
            status: user.status || 'inactive',
            address: user.address || '',
            avatar: user.avatar || '',
            createdAt: user.createdAt,
            lastActive: user.lastActive || user.createdAt,
            emergencyContacts: user.emergencyContacts || [],
            recentActivity: user.recentActivity || []
        };

        res.json(userResponse);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error' });
    }
});



// Get user details
// Add user update route
router.put('/user/:userId/update', adminAuth, async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { 
                $set: { 
                    name, 
                    email, 
                    phone, 
                    address 
                } 
            },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error during user update' });
    }
});

// Toggle user status (active/inactive)
router.put('/user/:userId/toggle-status', adminAuth, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.status = user.status === 'active' ? 'inactive' : 'active';
        await user.save();

        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get admin dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ status: 'active' });
        const recentUsers = await User.find()
            .select('name email createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            totalUsers,
            activeUsers,
            recentUsers
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/check-status', adminAuth, async (req, res) => {
    try {
        const admin = await Admin.findById(req.admin.id);
        if (!admin) {
            return res.status(403).json({ message: 'Not authorized as admin' });
        }
        res.status(200).json({ isAdmin: true });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;