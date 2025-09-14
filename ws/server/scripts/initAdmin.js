const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
require('dotenv').config();

async function initializeAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const adminExists = await Admin.findOne({ username: 'admin' });
        
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            
            const admin = new Admin({
                username: 'admin',
                password: hashedPassword,
                email: 'admin@wsapp.com',
                role: 'admin'
            });

            await admin.save();
            console.log('Default admin created successfully');
        } else {
            console.log('Admin already exists');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

initializeAdmin();