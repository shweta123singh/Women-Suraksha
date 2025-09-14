const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        default: 'admin'
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Update last login time
AdminSchema.methods.updateLastLogin = async function() {
    this.lastLogin = Date.now();
    await this.save();
};

module.exports = mongoose.model('Admin', AdminSchema);