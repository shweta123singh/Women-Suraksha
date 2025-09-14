// Check if user is logged in


const token = localStorage.getItem('token');
const baseUrl = window.location.origin;

// Redirect if not authenticated
if (!token && window.location.pathname !== '/' && 
    !window.location.pathname.includes('login.html') && 
    !window.location.pathname.includes('signup.html')) {
    window.location.href = 'login.html';
}

// Update UI based on authentication
function updateNavigation() {
    const dashboardLink = document.getElementById('dashboardLink');
    const loginLinks = document.querySelectorAll('a[href="login.html"]');
    const signupLinks = document.querySelectorAll('a[href="signup.html"]');

    if (token) {
        if (dashboardLink) dashboardLink.style.display = 'inline-block';
        loginLinks.forEach(link => link.style.display = 'none');
        signupLinks.forEach(link => link.style.display = 'none');
    } else {
        if (dashboardLink) dashboardLink.style.display = 'none';
    }
}

// Location tracking
function trackLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            position => {
                const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                updateLocation(location);
                updateLocationDisplay(location);
            },
            error => {
                console.error('Error getting location:', error);
                handleLocationError(error);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 30000,
                timeout: 27000
            }
        );
    } else {
        alert('Geolocation is not supported by this browser.');
    }
}

// Update location in backend
async function updateLocation(location) {
    try {
        const response = await fetch(`${baseUrl}/api/location/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                userId: getUserIdFromToken(token), // Add function to extract user ID from token
                latitude: location.latitude,
                longitude: location.longitude
            })
        });
        
        if (!response.ok) {
            throw new Error('Location update failed');
        }
        
        const data = await response.json();
        console.log('Location updated:', data.msg);
    } catch (err) {
        console.error('Error updating location:', err);
        // Retry logic could be added here
    }
}

// Update location display on dashboard
function updateLocationDisplay(location) {
    const locationStatus = document.getElementById('locationStatus');
    if (locationStatus) {
        locationStatus.textContent = `Latitude: ${location.latitude.toFixed(6)}, Longitude: ${location.longitude.toFixed(6)}`;
    }
}

// Handle location errors
function handleLocationError(error) {
    const locationStatus = document.getElementById('locationStatus');
    if (locationStatus) {
        switch(error.code) {
            case error.PERMISSION_DENIED:
                locationStatus.textContent = "Location access denied. Please enable location services.";
                break;
            case error.POSITION_UNAVAILABLE:
                locationStatus.textContent = "Location information unavailable.";
                break;
            case error.TIMEOUT:
                locationStatus.textContent = "Location request timed out.";
                break;
            default:
                locationStatus.textContent = "An unknown error occurred.";
                break;
        }
    }
}

// Send SOS
function getUserIdFromToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(window.atob(base64));
        return payload.id;
    } catch (err) {
        console.error('Error decoding token:', err);
        return null;
    }
}

// Update the sendSOS function
async function sendSOS() {
    try {
        const sosButton = document.querySelector('.sos-button');
        if (sosButton) sosButton.disabled = true;

        const userId = getUserIdFromToken(token);
        if (!userId) {
            throw new Error('User not authenticated');
        }

        const response = await fetch(`${baseUrl}/api/location/sos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ userId })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'SOS alert failed');
        }
        
        const data = await response.json();
        alert('SOS alert sent to emergency contacts!');
    } catch (err) {
        console.error('Error sending SOS:', err);
        alert(err.message || 'Failed to send SOS alert. Please try again.');
    } finally {
        if (sosButton) {
            sosButton.disabled = false;
        }
    }
}

// Initialize the application
function init() {
    updateNavigation();
    if (token && window.location.pathname.includes('dashboard.html')) {
        trackLocation();
    }
}

// Start the application
init();