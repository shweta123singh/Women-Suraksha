const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    emergencyContacts: [{
        name: String,
        phone: String,
        relationship: String,
        email: String
    }],
    lastLocation: {
        latitude: String,
        longitude: String,
        timestamp: Date
    },
    recentActivity: [{
        type: {
            type: String,
            enum: ['login', 'profile_update', 'password_change', 'sos_alert']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        details: {
            type: String
        }
    }],
    address: {
        type: String
    },
    profilePicture: {
        type: String
    }
}, {
    timestamps: true
});

// Update last active timestamp
userSchema.methods.updateLastActive = async function() {
    this.lastActive = Date.now();
    await this.save();
};

// Add activity log
userSchema.methods.addActivity = async function(activityType, details = '') {
    this.recentActivity.push({
        type: activityType,
        details: details
    });
    await this.save();
};

module.exports = mongoose.model('User', userSchema);