
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// Connect Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api/admin', require('./routes/admin'));
// Serve static files
app.use(express.static(path.join(__dirname, '../')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/location', require('./routes/location'));

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));