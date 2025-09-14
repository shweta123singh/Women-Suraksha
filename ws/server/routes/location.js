const express = require('express');
const router = express.Router();
const User = require('../models/User');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


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
// Configure rate limiter for SOS requests
const sosLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 requests per windowMs
  message: 'Too many SOS requests, please try again later'
});

// Update user location
router.post('/update', async (req, res) => {
  try {
    const { userId, latitude, longitude } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user.lastLocation = {
      latitude,
      longitude,
      timestamp: new Date()
    };

    await user.save();
    res.json({ msg: 'Location updated successfully' });
  } catch (err) {
    console.error('Location Update Error:', err);
    res.status(500).send('Server error');
  }
});

// Get user's last location
router.get('/last-location/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user.lastLocation);
  } catch (err) {
    console.error('Get Location Error:', err);
    res.status(500).send('Server error');
  }
});

// Send SOS alert
// Send SOS alert
router.post('/sos', sosLimiter, async (req, res) => {
  try {
    const { email, phone, latitude, longitude } = req.body;

    // Find user by email and phone
    const user = await User.findOne({ email, phone });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
      return res.status(400).json({ message: 'No emergency contacts found' });
    }

    // Update user's last location with live coordinates
    user.lastLocation = {
      latitude,
      longitude,
      timestamp: new Date()
    };
    await user.save();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    for (const contact of user.emergencyContacts) {
      try {
        await transporter.sendMail({
          to: contact.email,
          subject: 'SOS Alert',
          html: `
    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; border: 3px solid #ff0000; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(255, 0, 0, 0.2);">
        <div style="background: linear-gradient(135deg, #ff0000, #cc0000); color: white; padding: 25px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; text-transform: uppercase; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                🚨 EMERGENCY ALERT 🚨
            </h1>
        </div>
        
        <div style="padding: 30px; background-color: #fff;">
            <div style="background-color: #fff4f4; padding: 20px; border-radius: 10px; margin-bottom: 25px; border-left: 5px solid #ff0000;">
                <h2 style="color: #ff0000; margin: 0 0 15px 0; font-size: 24px;">
                    ⚠️ URGENT: Immediate Response Required
                </h2>
                <p style="font-size: 20px; margin: 0; color: #333; font-weight: bold;">
                    ${user.name} needs immediate assistance!
                </p>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 25px; border: 1px solid #dee2e6;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">
                    📍 Location Details
                </h3>
                <a href="https://www.google.com/maps?q=${latitude},${longitude}" 
                   style="background: linear-gradient(45deg, #007bff, #0056b3); color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; margin-bottom: 10px; transition: all 0.3s ease;">
                   View on Google Maps
                </a>
                <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">
                    Time Reported: ${new Date().toLocaleString()}
                </p>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 25px; border: 1px solid #dee2e6;">
                <h3 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">
                    📞 Contact Information
                </h3>
                <p style="margin: 5px 0; font-size: 16px;">
                    <strong>Phone:</strong> ${user.phone}
                </p>
            </div>

            <div style="background-color: #fff4f4; padding: 20px; border-radius: 10px; text-align: center; margin-top: 25px;">
                <p style="color: #ff0000; font-weight: bold; margin: 0; font-size: 18px;">
                    🚑 Please take immediate action and contact emergency services if necessary! 🚔
                </p>
            </div>
        </div>
        
        <div style="background: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd;">
            <p style="margin: 0;">
                This is an automated emergency alert system message. Please do not reply to this email.
            </p>
        </div>
    </div>
`
        });

        if (process.env.TWILIO_ENABLED === 'true') {
          await client.messages.create({
            body: `EMERGENCY: ${user.name} needs help! Current location: https://www.google.com/maps?q=${latitude},${longitude}`,
            to: contact.phone,
            from: process.env.TWILIO_PHONE_NUMBER
          });
        }
      } catch (contactErr) {
        console.error(`Failed to send alert to contact ${contact.email}:`, contactErr);
      }
    }

    res.json({ message: 'SOS alerts sent successfully' });
  } catch (err) {
    console.error('SOS Error:', err);
    res.status(500).json({ message: 'Failed to send SOS alerts' });
  }
});

// Add emergency contact
router.post('/add-contact', auth, async (req, res) => {
  try {
      const { contactName, contactPhone, contactEmail } = req.body;

      const user = await User.findById(req.user.id);
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      const emergencyContact = {
          name: contactName,
          phone: contactPhone,
          email: contactEmail
      };

      user.emergencyContacts.push(emergencyContact);
      await user.save();

      res.json({ message: 'Emergency contact added successfully' });
  } catch (err) {
      console.error('Add Contact Error:', err);
      res.status(500).json({ message: 'Server error' });
  }
});

// Remove emergency contact
router.delete('/remove-contact/:userId/:contactId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user.emergencyContacts = user.emergencyContacts.filter(
      contact => contact._id.toString() !== req.params.contactId
    );

    await user.save();
    res.json({ msg: 'Emergency contact removed successfully' });
  } catch (err) {
    console.error('Remove Contact Error:', err);
    res.status(500).send('Server error');
  }
});




router.get('/save-contacts-pdf/:userId', async (req, res) => {
  try {
      // Get user from the authenticated request
      const userId = req.params.userId;
      if (!userId) {
          return res.status(400).json({ message: 'User ID is required' });
      }

      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
          return res.status(400).json({ message: 'No emergency contacts found' });
      }

      const pdfBuffer = await generateContactsPDF(user.emergencyContacts);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=my-emergency-contacts.pdf');
      res.send(pdfBuffer);
  } catch (err) {
      console.error('Save Contacts PDF Error:', err);
      res.status(500).json({ message: 'Failed to generate PDF' });
  }
});


// Get emergency contacts
// Get emergency contacts
router.get('/contacts', async (req, res) => {
  try {
      // Get user ID from request headers
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
          return res.status(401).json({ message: 'No token provided' });
      }

      // Decode token to get user ID
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Return the emergency contacts
      res.json(user.emergencyContacts || []);
  } catch (err) {
      console.error('Get Contacts Error:', err);
      if (err.name === 'JsonWebTokenError') {
          return res.status(401).json({ message: 'Invalid token' });
      }
      res.status(500).json({ message: 'Failed to load contacts' });
  }
});




async function generateContactsPDF(contacts) {
  const doc = new PDFDocument();
  
  // Add header with styling
  doc.fontSize(24)
     .fillColor('#007bff')
     .text('Emergency Contacts List', { align: 'center' });
  doc.moveDown();

  // Add current date
  doc.fontSize(10)
     .fillColor('#666')
     .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
  doc.moveDown();

  // Add contacts with improved formatting
  contacts.forEach((contact, index) => {
      doc.fontSize(16)
         .fillColor('#333')
         .text(`Contact ${index + 1}`, { underline: true });
      doc.moveDown(0.5);
      
      doc.fontSize(12)
         .fillColor('#444')
         .text([
             `Name: ${contact.name}`,
             `Phone: ${contact.phone}`,
             `Email: ${contact.email}`
         ].join('\n'));
      
      // Add a line between contacts
      if (index < contacts.length - 1) {
          doc.moveDown()
             .lineCap('butt')
             .moveTo(50, doc.y)
             .lineTo(550, doc.y)
             .stroke('#ddd');
      }
      doc.moveDown();
  });

  // Add footer
  doc.fontSize(10)
     .fillColor('#666')
     .text('Keep this information safe and up to date', { align: 'center' });

  return new Promise((resolve) => {
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.end();
  });
}

module.exports = router;