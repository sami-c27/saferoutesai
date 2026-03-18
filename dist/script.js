///// Full Code 



// ========== GLOBAL VARIABLES ==========
let map = null;
let previewMap = null;
let userLocation = null;
let mapInitialized = false;
let currentUser = null;
let routeLayer = null;
let previewRouteLayer = null;
let allHazards = [];
let savedRoutes = [];
let howardCountySidewalks = [];
let howardCountyCrosswalks = [];
let howardCountySchools = {};
let geocodeCache = {};
let reportModalOpen = false;
let selectedHazardLocation = null;
let currentRoute = null;
let userLocationMarker = null;

// Valhalla API endpoints
const VALHALLA_API = {
  demo: 'https://valhalla1.openstreetmap.de/route',
  local: 'http://localhost:8002/route'
};

// Howard County Open Data endpoints
const HOWARD_COUNTY_DATA = {
  sidewalks: 'https://data.howardcountymd.gov/resource/b9a6-fxpp.json',
  crosswalks: 'https://data.howardcountymd.gov/resource/fn2r-hp5k.json',
  schools: 'https://data.howardcountymd.gov/resource/y3d6-v5i4.json',
  traffic_signals: 'https://data.howardcountymd.gov/resource/k8g5-ffah.json'
};

// Howard County boundaries
const HOWARD_COUNTY = {
  center: [39.267, -76.85],
  bounds: {
    north: 39.352,
    south: 39.150,
    west: -77.050,
    east: -76.750
  }
};

// Howard County Zip Codes
const HOWARD_COUNTY_ZIP_CODES = [
  '21029', '21036', '21042', '21043', '21044', '21045', '21046',
  '21075', '21076', '20723', '20724', '20759', '20777', '20794'
];

// Howard County neighborhoods and major intersections
const HOWARD_COUNTY_LOCATIONS = {
  // Ellicott City
  'ellicott city': { lat: 39.267, lng: -76.85 },
  'historic elliott city': { lat: 39.268, lng: -76.795 },
  'centennial lane': { lat: 39.2519, lng: -76.86 },
  'frederick road': { lat: 39.265, lng: -76.85 },
  
  // Columbia
  'columbia': { lat: 39.2037, lng: -76.861 },
  'columbia mall': { lat: 39.214, lng: -76.881 },
  'lake kitamaqundi': { lat: 39.210, lng: -76.870 },
  'merriweather post pavilion': { lat: 39.206, lng: -76.863 },
  
  // Clarksville
  'clarksville': { lat: 39.1943, lng: -76.934 },
  'clarksville commons': { lat: 39.191, lng: -76.929 },
  
  // Elkridge
  'elkridge': { lat: 39.212, lng: -76.713 },
  'patapsco state park': { lat: 39.225, lng: -76.725 },
  
  // Laurel
  'laurel': { lat: 39.099, lng: -76.848 },
  
  // Marriottsville
  'marriottsville': { lat: 39.352, lng: -76.898 },
  
  // Specific streets
  'route 40': { lat: 39.295, lng: -76.89 },
  'route 29': { lat: 39.232, lng: -76.88 },
  'route 108': { lat: 39.234, lng: -76.83 },
  'st johns lane': { lat: 39.246, lng: -76.84 }
};

// Hazard types
const HAZARD_TYPES = {
  traffic: { name: "Traffic/Speeding", icon: "fa-car", color: "#dc2626" },
  crosswalk: { name: "Crosswalk Issue", icon: "fa-person-walking", color: "#ea580c" },
  lighting: { name: "Street Light", icon: "fa-lightbulb", color: "#ca8a04" },
  sidewalk: { name: "Sidewalk Damage", icon: "fa-road", color: "#65a30d" },
  construction: { name: "Construction", icon: "fa-triangle-exclamation", color: "#7c3aed" },
  other: { name: "Other Hazard", icon: "fa-exclamation", color: "#475569" }
};

// ========== GEOLOCATION FUNCTIONS ==========
function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }
    
    showNotification('Getting your location...', 'info');
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        // Check if location is within Howard County bounds
        if (isInHowardCounty(lat, lng)) {
          userLocation = { lat, lng };
          
          // Update the start point input
          const startInput = document.getElementById('startPoint');
          if (startInput) {
            startInput.value = 'My Current Location';
            startInput.dataset.lat = lat;
            startInput.dataset.lng = lng;
          }
          
          // Also update the hazard location input if modal is open
          const hazardLocationInput = document.getElementById('hazardLocation');
          if (hazardLocationInput && reportModalOpen) {
            hazardLocationInput.value = 'My Current Location';
            hazardLocationInput.dataset.lat = lat;
            hazardLocationInput.dataset.lng = lng;
          }
          
          // Show on map if map is initialized
          if (map) {
            map.setView([lat, lng], 15);
            
            // Add marker for user location
            if (userLocationMarker) {
              map.removeLayer(userLocationMarker);
            }
            
            userLocationMarker = L.marker([lat, lng], {
              icon: L.divIcon({
                html: '<i class="fas fa-location-dot" style="color: #3b82f6; font-size: 32px;"></i>',
                iconSize: [32, 32],
                className: 'user-location-marker'
              })
            }).addTo(map)
              .bindPopup('<strong>Your Current Location</strong>')
              .openPopup();
          }
          
          resolve({ lat, lng });
          showNotification('Location found!', 'success');
        } else {
          showNotification('Location is outside Howard County. Using Howard County center.', 'warning');
          const howardCenter = HOWARD_COUNTY.center;
          userLocation = { lat: howardCenter[0], lng: howardCenter[1] };
          resolve(userLocation);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        
        let errorMessage = 'Unable to get your location. ';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage += 'Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage += 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage += 'Location request timed out.';
            break;
          default:
            errorMessage += 'An unknown error occurred.';
        }
        
        showNotification(errorMessage, 'error');
        reject(error);
      },
      options
    );
  });
}

function useCurrentLocation() {
  getUserLocation().then(location => {
    console.log('Using location:', location);
  }).catch(error => {
    // Fallback to Howard County center
    const howardCenter = HOWARD_COUNTY.center;
    userLocation = { lat: howardCenter[0], lng: howardCenter[1] };
    
    const startInput = document.getElementById('startPoint');
    if (startInput) {
      startInput.value = 'My Current Location';
      startInput.dataset.lat = howardCenter[0];
      startInput.dataset.lng = howardCenter[1];
    }
    
    showNotification('Using Howard County center as approximate location', 'info');
  });
}

function useCurrentLocationForHazard() {
  getUserLocation().then(location => {
    const hazardLocation = document.getElementById('hazardLocation');
    if (hazardLocation) {
      hazardLocation.value = 'My Current Location';
      hazardLocation.dataset.lat = location.lat;
      hazardLocation.dataset.lng = location.lng;
    }
  }).catch(error => {
    const hazardLocation = document.getElementById('hazardLocation');
    if (hazardLocation) {
      hazardLocation.value = 'Howard County, MD';
    }
    showNotification('Using Howard County as location', 'info');
  });
}

function isInHowardCounty(lat, lng) {
  return lat >= HOWARD_COUNTY.bounds.south && 
         lat <= HOWARD_COUNTY.bounds.north && 
         lng >= HOWARD_COUNTY.bounds.west && 
         lng <= HOWARD_COUNTY.bounds.east;
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
  console.log('Safe Routes AI loading...');
  
  try {
    // Load saved data from localStorage
    loadSavedData();
    
    // Initialize the dashboard view
    showView('dashboard');
    
    // Hide loading overlay after delay
    setTimeout(() => {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
    }, 1000);
    
    // Initialize core functions
    initAuth();
    setupEventListeners();
    loadHowardCountyData();
    loadHazards();
    updateStats();
    
    // Try to get user location on startup
    setTimeout(() => {
      getUserLocation().catch(() => {
        // Silent fail - user can manually get location later
      });
    }, 500);
    
    // Show auth modal if not logged in
    if (!currentUser) {
      setTimeout(() => showAuthModal('login'), 1500);
    }
  } catch (error) {
    console.error('Error during initialization:', error);
    showNotification('Error loading application. Please refresh.', 'error');
  }
});

function loadSavedData() {
  try {
    // Load saved routes
    const storedRoutes = localStorage.getItem('safeRoutesSavedRoutes');
    if (storedRoutes) {
      savedRoutes = JSON.parse(storedRoutes);
    }
    
    // Load hazards
    const storedHazards = localStorage.getItem('safeRoutesHazards');
    if (storedHazards) {
      allHazards = JSON.parse(storedHazards);
    }
    
    // Load user
    const storedUser = localStorage.getItem('safeRoutesCurrentUser');
    if (storedUser) {
      currentUser = JSON.parse(storedUser);
    }
  } catch (error) {
    console.error('Error loading saved data:', error);
  }
}

async function loadHowardCountyData() {
  console.log('Loading Howard County open data...');
  
  try {
    // Load Howard County schools from open data
    await loadHowardCountySchools();
    
    // Load sidewalks data
    try {
      const response = await fetch(HOWARD_COUNTY_DATA.sidewalks);
      const data = await response.json();
      howardCountySidewalks = processSidewalkData(data);
      console.log('Loaded sidewalks:', howardCountySidewalks.length);
    } catch (error) {
      console.warn('Could not load sidewalks data, using fallback');
      howardCountySidewalks = getFallbackSidewalks();
    }
    
    // Load crosswalks data
    try {
      const response = await fetch(HOWARD_COUNTY_DATA.crosswalks);
      const data = await response.json();
      howardCountyCrosswalks = processCrosswalkData(data);
      console.log('Loaded crosswalks:', howardCountyCrosswalks.length);
    } catch (error) {
      console.warn('Could not load crosswalks data, using fallback');
      howardCountyCrosswalks = getFallbackCrosswalks();
    }
    
    showNotification('Loaded Howard County open data', 'success');
    
    // Initialize map with Howard County data
    if (!mapInitialized && document.getElementById('map')) {
      initMap();
    }
  } catch (error) {
    console.error('Error loading Howard County data:', error);
    showNotification('Using demo data (Howard County data unavailable)', 'warning');
    loadDemoData();
  }
}

async function loadHowardCountySchools() {
  try {
    const response = await fetch(HOWARD_COUNTY_DATA.schools);
    const data = await response.json();
    
    // Process school data
    const schools = {};
    data.forEach(school => {
      if (school.latitude && school.longitude) {
        const name = school.school_name || school.name || 'Unknown School';
        schools[name.replace(/ /g, '_')] = {
          name: name,
          lat: parseFloat(school.latitude),
          lng: parseFloat(school.longitude),
          address: school.address || 'Howard County, MD',
          type: school.school_type || 'School'
        };
      }
    });
    
    // Store schools globally
    howardCountySchools = schools;
    
    // Populate dropdown
    populateSchoolDropdown(schools);
    
  } catch (error) {
    console.error('Error loading schools data:', error);
    loadDemoSchools();
  }
}

function processSidewalkData(data) {
  // Process sidewalk data from Howard County open data
  return data.map(item => ({
    id: item.objectid || item.id,
    name: item.street_name || 'Sidewalk',
    street: item.street_name || 'Unknown Street',
    coordinates: parseGeometry(item.geometry),
    condition: item.condition || 'unknown',
    width: item.width_ft || 5,
    connectsTo: []
  })).filter(sidewalk => sidewalk.coordinates.length > 0);
}

function processCrosswalkData(data) {
  // Process crosswalk data from Howard County open data
  return data.map(item => ({
    lat: parseFloat(item.latitude),
    lng: parseFloat(item.longitude),
    street: item.location || item.street_name || 'Unknown Street',
    type: item.type || 'marked',
    signalized: item.signalized === 'YES',
    school_zone: item.school_zone === 'YES'
  })).filter(crosswalk => !isNaN(crosswalk.lat) && !isNaN(crosswalk.lng));
}

function parseGeometry(geometry) {
  try {
    if (!geometry) return [];
    
    if (geometry.type === 'LineString' && geometry.coordinates) {
      // Convert from [lng, lat] to [lat, lng]
      return geometry.coordinates.map(coord => [coord[1], coord[0]]);
    }
    
    if (typeof geometry === 'string' && geometry.includes('LINESTRING')) {
      // Parse WKT format
      const coordsStr = geometry.match(/LINESTRING\s*\((.+)\)/)[1];
      const coords = coordsStr.split(',').map(pair => {
        const [lng, lat] = pair.trim().split(' ').map(Number);
        return [lat, lng];
      });
      return coords;
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing geometry:', error);
    return [];
  }
}

function getFallbackSidewalks() {
  return [
    {
      id: "SW001",
      name: "Centennial Lane Sidewalk",
      street: "Centennial Lane",
      coordinates: [
        [39.268, -76.855], [39.265, -76.856], [39.262, -76.857], 
        [39.259, -76.858], [39.256, -76.859], [39.253, -76.860],
        [39.250, -76.861], [39.247, -76.862]
      ],
      condition: "good",
      connectsTo: ["SW002", "SW003"]
    },
    {
      id: "SW002",
      name: "Frederick Road Sidewalk",
      street: "Frederick Road",
      coordinates: [
        [39.265, -76.850], [39.263, -76.852], [39.261, -76.854],
        [39.259, -76.856], [39.257, -76.858], [39.255, -76.860],
        [39.253, -76.862], [39.251, -76.864]
      ],
      condition: "fair",
      connectsTo: ["SW001", "SW003"]
    }
  ];
}

function getFallbackCrosswalks() {
  return [
    { lat: 39.258, lng: -76.859, street: "Centennial & Frederick", type: "marked", signalized: false, school_zone: true },
    { lat: 39.255, lng: -76.860, street: "Centennial & School Entrance", type: "signalized", signalized: true, school_zone: true },
    { lat: 39.262, lng: -76.856, street: "Main & Oak", type: "marked", signalized: false, school_zone: false }
  ];
}

function loadDemoSchools() {
  const schools = {
    "Centennial_High": { name: "Centennial High School", lat: 39.2519, lng: -76.86, address: "4300 Centennial Lane, Ellicott City", type: "High School" },
    "River_Hill_High": { name: "River Hill High School", lat: 39.2135, lng: -76.931, address: "12101 Clarksville Pike, Clarksville", type: "High School" },
    "Atholton_High": { name: "Atholton High School", lat: 39.2008, lng: -76.885, address: "6520 Freetown Road, Columbia", type: "High School" },
    "Hammond_High": { name: "Hammond High School", lat: 39.1772, lng: -76.882, address: "8800 Guilford Road, Columbia", type: "High School" },
    "Howard_High": { name: "Howard High School", lat: 39.2406, lng: -76.883, address: "8700 Old Annapolis Road, Ellicott City", type: "High School" },
    "Mount_View": { name: "Mount View Middle School", lat: 39.352, lng: -76.898, address: "12101 Woodford Drive, Marriottsville", type: "Middle School" },
    "Bellows_Spring": { name: "Bellows Spring Elementary", lat: 39.238, lng: -76.828, address: "8125 Old Stockbridge Road, Ellicott City", type: "Elementary School" }
  };
  
  howardCountySchools = schools;
  populateSchoolDropdown(schools);
}

function loadDemoData() {
  howardCountySidewalks = getFallbackSidewalks();
  howardCountyCrosswalks = getFallbackCrosswalks();
  loadDemoSchools();
}

function populateSchoolDropdown(schools) {
  try {
    const dropdown = document.getElementById('endPoint');
    if (!dropdown) return;
    
    let html = '<option value="">Select a school...</option>';
    Object.values(schools).forEach(school => {
      html += `<option value="${school.lat},${school.lng}">${school.name} (${school.type})</option>`;
    });
    dropdown.innerHTML = html;
  } catch (error) {
    console.error('Error populating school dropdown:', error);
  }
}

function initAuth() {
  try {
    updateAuthUI();
  } catch (e) {
    currentUser = null;
  }
}

function updateAuthUI() {
  try {
    const authButtons = document.getElementById('authButtons');
    const userProfile = document.getElementById('userProfile');
    
    if (currentUser && userProfile) {
      authButtons.style.display = 'none';
      userProfile.style.display = 'flex';
      document.getElementById('userName').textContent = currentUser.name || 'User';
      document.getElementById('userRole').textContent = currentUser.role || 'Parent';
      document.getElementById('userAvatar').textContent = (currentUser.name || 'UU').split(' ').map(n => n[0]).join('');
    } else if (authButtons) {
      authButtons.style.display = 'flex';
      if (userProfile) userProfile.style.display = 'none';
    }
  } catch (error) {
    console.error('Error updating auth UI:', error);
  }
}

// ========== VIEW FUNCTIONS ==========
function showView(viewName) {
  console.log('Showing view:', viewName);
  
  try {
    // Hide all views
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
      view.style.display = 'none';
    });
    
    // Remove active class from all nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.classList.remove('active');
    });
    
    // Show the selected view
    const selectedView = document.getElementById(`${viewName}-view`);
    if (selectedView) {
      selectedView.style.display = 'block';
      
      // Add active class to the clicked nav item
      const activeNavItem = Array.from(navItems).find(item => 
        item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${viewName}'`)
      );
      
      if (activeNavItem) {
        activeNavItem.classList.add('active');
      }
      
      // Load specific content for the view
      switch(viewName) {
        case 'dashboard':
          if (!mapInitialized) initMap();
          break;
        case 'route-finder':
          break;
        case 'safety-reports':
          loadSafetyReports();
          break;
        case 'saved-routes':
          loadSavedRoutes();
          break;
        case 'walk-groups':
          loadWalkGroups();
          break;
        case 'account':
          loadAccountInfo();
          break;
      }
    } else {
      console.error('View not found:', viewName);
    }
  } catch (error) {
    console.error('Error showing view:', error);
    showNotification('Error loading view', 'error');
  }
}

// ========== IMPROVED GEOCODING FUNCTIONS ==========
async function geocodeAddress(address) {
  try {
    // Check cache first
    const cacheKey = address.toLowerCase();
    if (geocodeCache[cacheKey]) {
      return geocodeCache[cacheKey];
    }
    
    // Check if it's "My Current Location"
    if (address.toLowerCase().includes('current location')) {
      if (userLocation) {
        return userLocation;
      } else {
        // Try to get current location
        try {
          const location = await getUserLocation();
          geocodeCache[cacheKey] = location;
          return location;
        } catch (error) {
          // Fallback to Howard County center
          const fallback = { lat: HOWARD_COUNTY.center[0], lng: HOWARD_COUNTY.center[1] };
          geocodeCache[cacheKey] = fallback;
          return fallback;
        }
      }
    }
    
    // Check for coordinates in input
    const coordMatch = address.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        const result = { lat, lng };
        geocodeCache[cacheKey] = result;
        return result;
      }
    }
    
    // Check for known Howard County locations
    const addressLower = address.toLowerCase();
    for (const [key, coords] of Object.entries(HOWARD_COUNTY_LOCATIONS)) {
      if (addressLower.includes(key)) {
        geocodeCache[cacheKey] = coords;
        return coords;
      }
    }
    
    // Check for Howard County zip codes
    for (const zip of HOWARD_COUNTY_ZIP_CODES) {
      if (address.includes(zip)) {
        // Return a location within that zip code area
        const result = {
          lat: HOWARD_COUNTY.center[0] + (Math.random() * 0.03 - 0.015),
          lng: HOWARD_COUNTY.center[1] + (Math.random() * 0.03 - 0.015)
        };
        geocodeCache[cacheKey] = result;
        return result;
      }
    }
    
    // Try to use OpenStreetMap Nominatim API for geocoding
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Howard County, MD')}&limit=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const result = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
          
          // Check if result is in Howard County
          if (isInHowardCounty(result.lat, result.lng)) {
            geocodeCache[cacheKey] = result;
            return result;
          }
        }
      }
    } catch (error) {
      console.warn('OpenStreetMap geocoding failed:', error);
    }
    
    // Fallback: return a random location within Howard County
    const fallback = {
      lat: HOWARD_COUNTY.center[0] + (Math.random() * 0.05 - 0.025),
      lng: HOWARD_COUNTY.center[1] + (Math.random() * 0.05 - 0.025)
    };
    
    geocodeCache[cacheKey] = fallback;
    return fallback;
    
  } catch (error) {
    console.error('Error geocoding address:', error);
    return { lat: HOWARD_COUNTY.center[0], lng: HOWARD_COUNTY.center[1] };
  }
}

// ========== VALHALLA ROUTING FUNCTIONS ==========
async function findRoute() {
  console.log('findRoute called');
  
  try {
    const startInput = document.getElementById('startPoint');
    const endSelect = document.getElementById('endPoint');
    
    if (!startInput || !endSelect) {
      showNotification('Route finder inputs not found', 'warning');
      return;
    }
    
    const startAddress = startInput.value.trim();
    const endValue = endSelect.value;
    
    // Validate inputs
    if (!startAddress) {
      showNotification('Please enter a starting point', 'warning');
      startInput.focus();
      return;
    }
    
    if (!endValue) {
      showNotification('Please select a destination school', 'warning');
      endSelect.focus();
      return;
    }
    
    // Check if we should avoid hazards
    const avoidHazards = shouldAvoidHazards();
    
    // Parse destination coordinates
    const [endLat, endLng] = endValue.split(',').map(Number);
    
    // Get start coordinates - handle "My Current Location" specially
    let startCoords;
    if (startAddress.toLowerCase().includes('current location') && startInput.dataset.lat) {
      // Use stored coordinates from geolocation
      startCoords = {
        lat: parseFloat(startInput.dataset.lat),
        lng: parseFloat(startInput.dataset.lng)
      };
    } else {
      // Geocode the address
      startCoords = await geocodeAddress(startAddress);
    }
    
    if (startCoords) {
      showNotification('Calculating routes with Valhalla...', 'info');
      
      // Generate multiple route options using Valhalla
      const routes = await generateValhallaRoutes(
        startCoords.lat, 
        startCoords.lng, 
        endLat, 
        endLng,
        avoidHazards
      );
      
      if (routes && routes.length > 0) {
        // Display route options
        displayRouteOptions(routes);
        showNotification(`Found ${routes.length} route options`, 'success');
      } else {
        showNotification('Could not generate routes', 'warning');
        // Fallback to basic route
        generateFallbackRoute(startCoords.lat, startCoords.lng, endLat, endLng);
      }
    } else {
      showNotification('Could not find start location', 'error');
    }
  } catch (error) {
    console.error('Error finding route:', error);
    showNotification('Error generating route. Using fallback.', 'error');
    // Fallback to basic routing
    const startInput = document.getElementById('startPoint');
    const endSelect = document.getElementById('endPoint');
    const startAddress = startInput.value.trim();
    const endValue = endSelect.value;
    const startCoords = await geocodeAddress(startAddress);
    const [endLat, endLng] = endValue.split(',').map(Number);
    if (startCoords) {
      generateFallbackRoute(startCoords.lat, startCoords.lng, endLat, endLng);
    }
  }
}

function shouldAvoidHazards() {
  try {
    // Find the "Avoid known hazards" checkbox (4th checkbox in the list)
    const checkboxes = document.querySelectorAll('.route-options .checkbox input[type="checkbox"]');
    
    if (checkboxes.length >= 4) {
      // The 4th checkbox is "Avoid known hazards"
      return checkboxes[3].checked;
    }
    
    // Fallback: try to find by checking text
    const labels = document.querySelectorAll('.route-options .checkbox span');
    for (let i = 0; i < labels.length; i++) {
      if (labels[i].textContent.includes('Avoid known hazards')) {
        const checkbox = labels[i].previousElementSibling;
        return checkbox.checked;
      }
    }
    
    return true; // Default to true for safety
  } catch (error) {
    console.error('Error checking hazards checkbox:', error);
    return true;
  }
}

async function generateValhallaRoutes(startLat, startLng, endLat, endLng, avoidHazards) {
  try {
    // Prepare Valhalla API request
    const requestBody = {
      locations: [
        { lat: startLat, lon: startLng },
        { lat: endLat, lon: endLng }
      ],
      costing: "pedestrian",
      costing_options: {
        pedestrian: {
          sidewalk_factor: 0.1, // Prefer sidewalks
          alley_factor: 10,     // Avoid alleys
          use_sidewalks: 1,     // Use sidewalks when available
          walkway_factor: 0.1,  // Prefer walkways
        }
      },
      directions_options: {
        units: "miles",
        language: "en-US"
      },
      // Request multiple route alternatives
      alternatives: 3,
      id: "howard_county_school_route"
    };
    
    console.log('Sending Valhalla request:', requestBody);
    
    // Try Valhalla demo API
    const response = await fetch(VALHALLA_API.demo, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`Valhalla API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Valhalla response:', data);
    
    // Process Valhalla routes
    return processValhallaRoutes(data, startLat, startLng, endLat, endLng, avoidHazards);
    
  } catch (error) {
    console.error('Error with Valhalla routing:', error);
    // Fallback to local routing
    return generateLocalRoutes(startLat, startLng, endLat, endLng, avoidHazards);
  }
}

function processValhallaRoutes(valhallaData, startLat, startLng, endLat, endLng, avoidHazards) {
  const routes = [];
  
  if (valhallaData.trip && valhallaData.trip.legs && valhallaData.trip.legs.length > 0) {
    // Process main route
    const mainRoute = createRouteFromValhallaLeg(
      valhallaData.trip,
      startLat, startLng, endLat, endLng,
      avoidHazards,
      0
    );
    routes.push(mainRoute);
    
    // Process alternative routes if available
    if (valhallaData.alternate_routes && valhallaData.alternate_routes.length > 0) {
      valhallaData.alternate_routes.forEach((altRoute, index) => {
        if (altRoute.trip && altRoute.trip.legs && altRoute.trip.legs.length > 0) {
          const route = createRouteFromValhallaLeg(
            altRoute.trip,
            startLat, startLng, endLat, endLng,
            avoidHazards,
            index + 1
          );
          routes.push(route);
        }
      });
    }
  }
  
  return routes;
}

// ========== UPDATED: CREATE ROUTE FROM VALHALLA LEG ==========
function createRouteFromValhallaLeg(trip, startLat, startLng, endLat, endLng, avoidHazards, routeIndex) {
  const leg = trip.legs[0];
  
  // Extract shape points
  const waypoints = decodePolyline(leg.shape);
  
  // Calculate direct distance between start and end
  const directDistance = calculateDistance(startLat, startLng, endLat, endLng);
  
  // Calculate route distance from Valhalla or use direct distance as fallback
  let routeDistance;
  if (leg.summary && leg.summary.length) {
    routeDistance = (leg.summary.length * 0.000621371).toFixed(1); // Convert meters to miles
  } else {
    // Calculate path distance from waypoints
    routeDistance = calculatePathDistance(waypoints).toFixed(1);
  }
  
  // Make sure we have a valid distance
  if (parseFloat(routeDistance) < 0.1) {
    routeDistance = Math.max(directDistance * 1.2, 0.5).toFixed(1); // At least 20% longer than direct
  }
  
  // Calculate hazards avoided
  const hazardsAvoided = avoidHazards ? 
    countHazardsAvoided(waypoints, startLat, startLng, endLat, endLng) : 
    countHazardsNearPath(waypoints);
  
  // Calculate safety score
  const safetyScore = calculateRouteSafetyScore(waypoints, hazardsAvoided, avoidHazards);
  
  // Generate instructions - pass the route distance

const instructions = generateInstructionsFromManeuvers(leg.maneuvers, parseFloat(routeDistance));


  
  return {
    id: `route_${routeIndex}_${Date.now()}`,
    start: { lat: startLat, lng: startLng },
    end: { lat: endLat, lng: endLng },
    waypoints: waypoints,
    schoolName: getSelectedSchoolName(),
    distance: routeDistance,
    walkingTime: leg.summary ? Math.round(leg.summary.time / 60) : Math.round((parseFloat(routeDistance) / 3.1) * 60),
    safetyScore: safetyScore,
    hazardsAvoided: hazardsAvoided,
    crosswalksUsed: countCrosswalksOnPath(waypoints),
    instructions: instructions,
    safetyLevel: safetyScore >= 90 ? 'excellent' : safetyScore >= 75 ? 'good' : 'fair',
    avoidHazards: avoidHazards,
    routeIndex: routeIndex,
    isValhallaRoute: true,
    summary: leg.summary,
    timestamp: Date.now()
  };
}




///// FIX THIS 

function generateInstructionsFromManeuvers(maneuvers, routeDistance) {
  // If no maneuvers or invalid route distance, generate local instructions
  if (!maneuvers || maneuvers.length === 0 || !routeDistance) {
    console.log('Using fallback instructions, no maneuvers or invalid route distance');
    return generateLocalInstructions([], routeDistance || 2.5, 'valhalla');
  }
  
  const instructions = [];
  let cumulativeDistance = 0;
  
  // Convert routeDistance to number if it's a string
  const totalDistance = parseFloat(routeDistance) || 2.5;
  
  console.log(`Generating instructions for route distance: ${totalDistance} miles`);
  console.log('Maneuvers:', maneuvers);
  
  // Start instruction - always at 0.0 miles
  instructions.push({
    number: 1,
    action: 'Start walking',
    street: 'from starting point',
    distance: '0.0',
    icon: 'fa-walking',
    color: '#10b981'
  });
  
  // Process each maneuver (skip the first one which is usually "start")
  for (let i = 1; i < maneuvers.length && i < 5; i++) { // Limit to 5 maneuvers max
    const maneuver = maneuvers[i];
    
    // Calculate segment distance in miles
    let segmentDistance;
    if (maneuver.length) {
      segmentDistance = maneuver.length * 0.000621371; // Convert meters to miles
    } else {
      // Estimate segment distance based on remaining distance
      const segmentsRemaining = maneuvers.length - i;
      segmentDistance = (totalDistance - cumulativeDistance) / (segmentsRemaining + 1);
    }
    
    // Ensure segment distance is reasonable
    segmentDistance = Math.max(segmentDistance, 0.1);
    segmentDistance = Math.min(segmentDistance, totalDistance - cumulativeDistance - 0.1);
    
    cumulativeDistance += segmentDistance;
    
    // Cap cumulative distance to leave room for arrival
    if (cumulativeDistance >= totalDistance * 0.95) {
      cumulativeDistance = totalDistance * 0.8;
    }
    
    console.log(`Maneuver ${i}: segment=${segmentDistance.toFixed(2)}, cumulative=${cumulativeDistance.toFixed(2)}`);
    
    instructions.push({
      number: i + 1,
      action: getActionFromManeuver(maneuver),
      street: (maneuver.street_names && maneuver.street_names.length > 0) ? 
              maneuver.street_names.join(', ') : 'Street',
      distance: cumulativeDistance.toFixed(1),
      icon: getIconFromManeuver(maneuver),
      color: getColorFromAction(getActionFromManeuver(maneuver))
    });
  }
  
  // Add arrival instruction with the exact route distance
  instructions.push({
    number: instructions.length + 1,
    action: 'Arrive at',
    street: getSelectedSchoolName(),
    distance: totalDistance.toFixed(1),
    icon: 'fa-school',
    color: '#8b5cf6'
  });
  
  console.log('Generated instructions:', instructions);
  return instructions;
}















function decodePolyline(encoded) {
  // Decode Valhalla polyline (similar to Google's polyline algorithm)
  const points = [];
  let index = 0, lat = 0, lng = 0;
  
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    
    shift = 0;
    result = 0;
    
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    
    points.push([lat * 1e-6, lng * 1e-6]);
  }
  
  return points;
}













function getActionFromManeuver(maneuver) {
  switch(maneuver.type) {
    case 1: return 'Start';
    case 2: return 'Continue';
    case 3: return 'Turn right';
    case 4: return 'Turn left';
    case 5: return 'Slight right';
    case 6: return 'Slight left';
    case 7: return 'Sharp right';
    case 8: return 'Sharp left';
    case 9: return 'U-turn';
    case 10: return 'Arrive';
    case 11: return 'Merge';
    case 12: return 'Roundabout';
    default: return 'Continue';
  }
}

function getIconFromManeuver(maneuver) {
  switch(maneuver.type) {
    case 3: case 5: case 7: return 'fa-arrow-right';
    case 4: case 6: case 8: return 'fa-arrow-left';
    case 9: return 'fa-undo';
    case 12: return 'fa-circle';
    default: return 'fa-arrow-up';
  }
}

function generateLocalRoutes(startLat, startLng, endLat, endLng, avoidHazards) {
  // Generate multiple route alternatives locally
  const routes = [];
  
  // Option 1: Direct route
  routes.push(createLocalRoute(startLat, startLng, endLat, endLng, avoidHazards, 0, 'direct'));
  
  // Option 2: Scenic/safe route (if avoiding hazards)
  if (avoidHazards) {
    routes.push(createLocalRoute(startLat, startLng, endLat, endLng, true, 1, 'safe'));
  }
  
  // Option 3: Balanced route
  routes.push(createLocalRoute(startLat, startLng, endLat, endLng, avoidHazards, 2, 'balanced'));
  
  return routes;
}





// ========== UPDATED: CREATE LOCAL ROUTE ==========
function createLocalRoute(startLat, startLng, endLat, endLng, avoidHazards, index, type) {
  let waypoints;
  
  switch(type) {
    case 'direct':
      waypoints = createDirectPath(startLat, startLng, endLat, endLng);
      break;
    case 'safe':
      waypoints = createSafePath(startLat, startLng, endLat, endLng);
      break;
    case 'balanced':
      waypoints = createBalancedPath(startLat, startLng, endLat, endLng);
      break;
  }
  
  // Calculate direct distance
  const directDistance = calculateDistance(startLat, startLng, endLat, endLng);
  
  // Calculate route distance based on type
  let routeDistance;
  switch(type) {
    case 'direct':
      routeDistance = directDistance;
      break;
    case 'safe':
      routeDistance = directDistance * 1.3; // 30% longer
      break;
    case 'balanced':
      routeDistance = directDistance * 1.15; // 15% longer
      break;
    default:
      routeDistance = directDistance;
  }
  
  // Ensure minimum distance
  routeDistance = Math.max(routeDistance, 0.5);
  
  const hazardsAvoided = avoidHazards ? 
    countHazardsAvoided(waypoints, startLat, startLng, endLat, endLng) : 
    countHazardsNearPath(waypoints);
  const safetyScore = calculateRouteSafetyScore(waypoints, hazardsAvoided, avoidHazards);
  
  return {
    id: `local_route_${index}_${Date.now()}`,
    start: { lat: startLat, lng: startLng },
    end: { lat: endLat, lng: endLng },
    waypoints: waypoints,
    schoolName: getSelectedSchoolName(),
    distance: routeDistance.toFixed(1),
    walkingTime: Math.round((routeDistance / 3.1) * 60), // 3.1 mph walking speed
    safetyScore: safetyScore,
    hazardsAvoided: hazardsAvoided,
    crosswalksUsed: countCrosswalksOnPath(waypoints),
    instructions: generateLocalInstructions(waypoints, routeDistance, type),
    safetyLevel: safetyScore >= 90 ? 'excellent' : safetyScore >= 75 ? 'good' : 'fair',
    avoidHazards: avoidHazards,
    routeIndex: index,
    isValhallaRoute: false,
    routeType: type,
    timestamp: Date.now()
  };
}

















function createDirectPath(startLat, startLng, endLat, endLng) {
  const path = [];
  const steps = 10;
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const lat = startLat + (endLat - startLat) * progress;
    const lng = startLng + (endLng - startLng) * progress;
    path.push([lat, lng]);
  }
  
  return path;
}

function createSafePath(startLat, startLng, endLat, endLng) {
  const path = [];
  const steps = 15;
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    let lat = startLat + (endLat - startLat) * progress;
    let lng = startLng + (endLng - startLng) * progress;
    
    // Add curvature to avoid hazards
    const curve = 0.005 * Math.sin(progress * Math.PI);
    lat += curve;
    lng += curve * 0.5;
    
    path.push([lat, lng]);
  }
  
  return path;
}

function createBalancedPath(startLat, startLng, endLat, endLng) {
  const path = [];
  const steps = 12;
  
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    let lat = startLat + (endLat - startLat) * progress;
    let lng = startLng + (endLng - startLng) * progress;
    
    // Moderate curvature
    const curve = 0.003 * Math.sin(progress * Math.PI * 0.7);
    lat += curve;
    lng += curve * 0.3;
    
    path.push([lat, lng]);
  }
  
  return path;
}



// FIX THIS 

// ========== UPDATED: GENERATE LOCAL INSTRUCTIONS ==========
function generateLocalInstructions(waypoints, totalDistance, routeType) {
  const instructions = [];
  const streetNames = [
    "Centennial Lane", "Frederick Road", "Route 108", "St. Johns Lane",
    "Montgomery Road", "Old Columbia Pike", "Oak Street", "Maple Avenue"
  ];
  
  // Ensure totalDistance is a number
  totalDistance = parseFloat(totalDistance) || 2.5;
  
  // Start instruction
  instructions.push({
    number: 1,
    action: 'Start walking',
    street: 'from starting point',
    distance: '0.0',
    icon: 'fa-walking',
    color: '#10b981'
  });
  
  // Middle instruction based on route type
  if (routeType === 'safe') {
    instructions.push({
      number: 2,
      action: 'Take safe route via',
      street: streetNames[1],
      distance: (totalDistance * 0.3).toFixed(1),
      icon: 'fa-shield-alt',
      color: '#3b82f6'
    });
    instructions.push({
      number: 3,
      action: 'Continue on',
      street: streetNames[2],
      distance: (totalDistance * 0.6).toFixed(1),
      icon: 'fa-road',
      color: '#10b981'
    });
  } else if (routeType === 'balanced') {
    instructions.push({
      number: 2,
      action: 'Head toward',
      street: streetNames[0],
      distance: (totalDistance * 0.3).toFixed(1),
      icon: 'fa-arrow-up',
      color: '#3b82f6'
    });
    instructions.push({
      number: 3,
      action: 'Continue straight',
      street: streetNames[3],
      distance: (totalDistance * 0.65).toFixed(1),
      icon: 'fa-road',
      color: '#10b981'
    });
  } else { // direct
    instructions.push({
      number: 2,
      action: 'Head directly toward',
      street: streetNames[0],
      distance: (totalDistance * 0.4).toFixed(1),
      icon: 'fa-arrow-up',
      color: '#3b82f6'
    });
    instructions.push({
      number: 3,
      action: 'Continue straight',
      street: streetNames[2],
      distance: (totalDistance * 0.8).toFixed(1),
      icon: 'fa-road',
      color: '#10b981'
    });
  }
  
  // Arrival instruction
  instructions.push({
    number: 4,
    action: 'Arrive at',
    street: getSelectedSchoolName(),
    distance: totalDistance.toFixed(1),
    icon: 'fa-school',
    color: '#8b5cf6'
  });
  
  return instructions;
}











function generateLocalInstructions(waypoints, totalDistance, routeType) {
  const instructions = [];
  const streetNames = [
    "Centennial Lane", "Frederick Road", "Route 108", "St. Johns Lane",
    "Montgomery Road", "Old Columbia Pike", "Oak Street", "Maple Avenue"
  ];
  
  instructions.push({
    number: 1,
    action: 'Start walking',
    street: 'from starting point',
    distance: '0.0',
    icon: 'fa-walking',
    color: '#10b981'
  });
  
  if (routeType === 'safe') {
    instructions.push({
      number: 2,
      action: 'Take safe route via',
      street: streetNames[1],
      distance: (totalDistance * 0.3).toFixed(1),
      icon: 'fa-shield-alt',
      color: '#3b82f6'
    });
  }
  
  instructions.push({
    number: 3,
    action: 'Continue on',
    street: streetNames[2],
    distance: (totalDistance * 0.6).toFixed(1),
    icon: 'fa-road',
    color: '#10b981'
  });
  
  instructions.push({
    number: 4,
    action: 'Arrive at',
    street: getSelectedSchoolName(),
    distance: totalDistance.toFixed(1),
    icon: 'fa-school',
    color: '#8b5cf6'
  });
  
  return instructions;
}

function getSelectedSchoolName() {
  const select = document.getElementById('endPoint');
  const selectedOption = select.options[select.selectedIndex];
  return selectedOption ? selectedOption.text.split(' (')[0] : 'School';
}

// ========== CALCULATION FUNCTIONS ==========
function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return 1.0;
  }
}

function calculatePathDistance(path) {
  try {
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      totalDistance += calculateDistance(
        path[i][0], path[i][1],
        path[i + 1][0], path[i + 1][1]
      );
    }
    return totalDistance;
  } catch (error) {
    console.error('Error calculating path distance:', error);
    return 1.5;
  }
}

function countHazardsNearPath(path) {
  try {
    if (!allHazards.length) return 0;
    
    let count = 0;
    
    for (let i = 0; i < path.length - 1; i++) {
      const segmentStart = path[i];
      const segmentEnd = path[i + 1];
      
      allHazards.forEach(hazard => {
        const distance = minDistanceToPath(hazard.lat, hazard.lng, [segmentStart, segmentEnd]);
        
        if (distance < 0.02) {
          count++;
        }
      });
    }
    
    return Math.min(count, allHazards.length);
  } catch (error) {
    console.error('Error counting hazards:', error);
    return 0;
  }
}

function countHazardsAvoided(path, startLat, startLng, endLat, endLng) {
  try {
    if (!allHazards.length) return 0;
    
    let avoided = 0;
    const directPathDistance = calculateDistance(startLat, startLng, endLat, endLng);
    const safePathDistance = calculatePathDistance(path);
    
    // Count hazards that would be on a direct path but aren't on this path
    for (const hazard of allHazards) {
      // Check if hazard is between start and end
      const hazardDistToLine = distanceToLineSegment(
        hazard.lat, hazard.lng,
        startLat, startLng,
        endLat, endLng
      );
      
      const hazardDistToPath = minDistanceToPath(hazard.lat, hazard.lng, path);
      
      // If hazard is close to direct line but far from safe path, it's avoided
      if (hazardDistToLine < 0.02 && hazardDistToPath > 0.03) {
        avoided++;
      }
    }
    
    // Add bonus for longer detours (showing active avoidance)
    const detourRatio = safePathDistance / Math.max(directPathDistance, 0.1);
    if (detourRatio > 1.1) {
      avoided += Math.floor((detourRatio - 1.1) * 10);
    }
    
    return Math.min(avoided, allHazards.length);
  } catch (error) {
    console.error('Error counting hazards avoided:', error);
    return Math.min(3, allHazards.length);
  }
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  // Calculate distance from point (px,py) to line segment (x1,y1)-(x2,y2)
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function minDistanceToPath(lat, lng, path) {
  let minDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const dist = distanceToLineSegment(lat, lng, path[i][0], path[i][1], path[i+1][0], path[i+1][1]);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

function countCrosswalksOnPath(path) {
  try {
    let count = 0;
    
    howardCountyCrosswalks.forEach(crosswalk => {
      for (let i = 0; i < path.length - 1; i++) {
        const segmentStart = path[i];
        const segmentEnd = path[i + 1];
        
        const midLat = (segmentStart[0] + segmentEnd[0]) / 2;
        const midLng = (segmentStart[1] + segmentEnd[1]) / 2;
        
        const distance = calculateDistance(midLat, midLng, crosswalk.lat, crosswalk.lng);
        if (distance < 0.03) {
          count++;
          break;
        }
      }
    });
    
    return Math.min(count, 5);
  } catch (error) {
    console.error('Error counting crosswalks:', error);
    return 0;
  }
}

function calculateRouteSafetyScore(path, hazardsAvoided, avoidHazards) {
  let score = avoidHazards ? 70 : 60;
  score += hazardsAvoided * (avoidHazards ? 10 : -5);
  
  // Bonus for using sidewalks
  let sidewalkBonus = 0;
  path.forEach(point => {
    howardCountySidewalks.forEach(sidewalk => {
      const dist = minDistanceToPath(point[0], point[1], sidewalk.coordinates);
      if (dist < 0.01) sidewalkBonus += 2;
    });
  });
  
  score += Math.min(20, sidewalkBonus);
  return Math.min(100, Math.max(30, score));
}

function generateFallbackRoute(startLat, startLng, endLat, endLng) {
  const avoidHazards = shouldAvoidHazards();
  const routes = generateLocalRoutes(startLat, startLng, endLat, endLng, avoidHazards);
  
  if (routes.length > 0) {
    currentRoute = routes[0];
    displayRoutePreview(currentRoute);
    showNotification('Generated route using local algorithm', 'info');
  }
}

// ========== DISPLAY FUNCTIONS ==========
function displayRouteOptions(routes) {
  const placeholder = document.getElementById('routePlaceholder');
  const previewContainer = document.getElementById('routePreviewContainer');
  
  if (placeholder) placeholder.style.display = 'none';
  if (previewContainer) previewContainer.style.display = 'block';
  
  // Create route selection interface
  const routeDetails = document.querySelector('.route-details');
  if (routeDetails) {
    let html = `
      <div class="route-options-header">
        <h4><i class="fas fa-route"></i> Multiple Route Options</h4>
        <p class="text-muted">Select the best route for your needs</p>
      </div>
      <div class="route-options-grid">
    `;
    
    routes.forEach((route, index) => {
      const isValhalla = route.isValhallaRoute;
      const routeType = route.routeType || (isValhalla ? 'valhalla' : 'local');
      const typeLabels = {
        'direct': 'Fastest',
        'safe': 'Safest',
        'balanced': 'Balanced',
        'valhalla': 'Optimized'
      };
      
      html += `
        <div class="route-option-card ${index === 0 ? 'selected' : ''}" onclick="selectRouteOption(${index}, ${JSON.stringify(route).replace(/"/g, '&quot;')})">
          <div class="route-option-header">
            <div>
              <h5>Option ${index + 1}: ${typeLabels[routeType] || 'Route'} ${route.isValhallaRoute ? '<span class="valhalla-badge">Valhalla</span>' : ''}</h5>
              <div class="route-option-subtitle">
                <span><i class="fas fa-ruler"></i> ${route.distance} mi</span>
                <span><i class="fas fa-clock"></i> ${route.walkingTime} min</span>
                <span><i class="fas fa-shield-alt" style="color: ${route.safetyLevel === 'excellent' ? '#10b981' : route.safetyLevel === 'good' ? '#3b82f6' : '#f59e0b'}"></i> ${route.safetyScore}/100</span>
              </div>
            </div>
            ${index === 0 ? '<span class="recommended-badge"><i class="fas fa-star"></i> Recommended</span>' : ''}
          </div>
          
          <div class="route-option-details">
            <div class="route-option-stat">
              <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
              <span>${route.avoidHazards ? 'Avoids' : 'May encounter'} ${route.hazardsAvoided} hazard${route.hazardsAvoided === 1 ? '' : 's'}</span>
            </div>
            <div class="route-option-stat">
              <i class="fas fa-person-walking" style="color: #8b5cf6;"></i>
              <span>${route.crosswalksUsed} crosswalk${route.crosswalksUsed === 1 ? '' : 's'}</span>
            </div>
            <div class="route-option-stat">
              <i class="fas fa-route" style="color: #10b981;"></i>
              <span>${route.isValhallaRoute ? 'Valhalla optimized' : 'Local route'}</span>
            </div>
          </div>
          
          <div class="route-option-actions">
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); selectRouteOption(${index}, ${JSON.stringify(route).replace(/"/g, '&quot;')})">
              <i class="fas fa-eye"></i> View Details
            </button>
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); previewRouteOnMap(${index}, ${JSON.stringify(route).replace(/"/g, '&quot;')})">
              <i class="fas fa-map"></i> Preview
            </button>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    
    // Find or create route details container
    const existingOptions = document.getElementById('routeOptions');
    if (existingOptions) {
      existingOptions.innerHTML = html;
    } else {
      const optionsDiv = document.createElement('div');
      optionsDiv.id = 'routeOptions';
      optionsDiv.innerHTML = html;
      routeDetails.prepend(optionsDiv);
    }
  }
  
  // Display first route by default
  if (routes.length > 0) {
    currentRoute = routes[0];
    displayRoutePreview(currentRoute);
  }
}

function selectRouteOption(index, route) {
  currentRoute = route;
  
  // Update UI
  document.querySelectorAll('.route-option-card').forEach((card, i) => {
    if (i === index) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
  
  displayRoutePreview(route);
  showNotification(`Selected route option ${index + 1}`, 'success');
}

function previewRouteOnMap(index, route) {
  // Create a temporary preview of the route on the map
  if (previewMap) {
    // Clear previous preview
    if (previewRouteLayer) {
      previewMap.removeLayer(previewRouteLayer);
    }
    
    // Add new preview
    const lineColor = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'][index % 4];
    previewRouteLayer = L.polyline(route.waypoints, {
      color: lineColor,
      weight: 4,
      opacity: 0.7,
      dashArray: '5, 5'
    }).addTo(previewMap);
    
    // Fit to route
    const bounds = L.latLngBounds(route.waypoints);
    previewMap.fitBounds(bounds, { padding: [30, 30] });
    
    showNotification(`Previewing route option ${index + 1}`, 'info');
  }
}






//  FIX THIS



 function displayRoutePreview(route) {
  try {
    const placeholder = document.getElementById('routePlaceholder');
    const previewContainer = document.getElementById('routePreviewContainer');
    
    if (placeholder) placeholder.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'block';
    
    // Update route summary
    const routeSummary = document.getElementById('routeSummary');
    if (routeSummary) {
      const isValhalla = route.isValhallaRoute || false;
      
      // Ensure all values are properly formatted with defaults
      const distance = route.distance ? route.distance.toString() : "2.5";
      const walkingTime = route.walkingTime ? route.walkingTime.toString() : "30";
      const hazardsAvoided = route.hazardsAvoided ? route.hazardsAvoided.toString() : "3";
      const crosswalksUsed = route.crosswalksUsed ? route.crosswalksUsed.toString() : "2";
      const safetyScore = route.safetyScore ? route.safetyScore.toString() : "85";
      const safetyLevel = route.safetyLevel || 'good';
      
      // Generate the HTML with proper values
      routeSummary.innerHTML = `
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: #3b82f6;">
            <i class="fas fa-ruler"></i>
          </div>
          <div class="stat-value">${distance}</div>
          <div class="stat-label">Distance (miles)</div>
        </div>
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: #10b981;">
            <i class="fas fa-clock"></i>
          </div>
          <div class="stat-value">${walkingTime}</div>
          <div class="stat-label">Walking Time (min)</div>
        </div>
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: #ef4444;">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="stat-value">${hazardsAvoided}</div>
          <div class="stat-label">${route.avoidHazards ? 'Hazards Avoided' : 'Hazards on Route'}</div>
        </div>
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: #8b5cf6;">
            <i class="fas fa-person-walking"></i>
          </div>
          <div class="stat-value">${crosswalksUsed}</div>
          <div class="stat-label">Crosswalks</div>
        </div>
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: ${safetyLevel === 'excellent' ? '#10b981' : safetyLevel === 'good' ? '#3b82f6' : '#f59e0b'};">
            <i class="fas fa-shield-alt"></i>
          </div>
          <div class="stat-value">${safetyScore}</div>
          <div class="stat-label">Safety Score</div>
        </div>
        <div class="stat-item-preview">
          <div class="stat-icon" style="background: ${isValhalla ? '#7c3aed' : '#06b6d4'};">
            <i class="fas ${isValhalla ? 'fa-server' : 'fa-laptop'}"></i>
          </div>
          <div class="stat-value">${isValhalla ? 'Valhalla' : 'Local'}</div>
          <div class="stat-label">Routing Engine</div>
        </div>
      `;
    }
    
    // Update instructions - ensure instructions have proper distances
    const routeInstructions = document.getElementById('routeInstructions');
    if (routeInstructions) {
      // Get instructions from route or generate fallback
      let instructions = route.instructions || [];
      
      console.log('Route instructions:', instructions);
      console.log('Route distance:', route.distance);
      
      // If no instructions or all instructions have 0 distance, regenerate them
      if (instructions.length === 0 || instructions.every(step => step.distance === '0.0' || step.distance === 0)) {
        console.log('Regenerating instructions due to missing or zero distances');
        const totalDistance = parseFloat(route.distance) || 2.5;
        const routeType = route.routeType || (route.isValhallaRoute ? 'valhalla' : 'local');
        
        if (route.isValhallaRoute) {
          // For Valhalla routes, use the route distance to generate instructions
          instructions = generateInstructionsFromManeuvers([], totalDistance);
        } else {
          // For local routes
          instructions = generateLocalInstructions(route.waypoints || [], totalDistance, routeType);
        }
      }
      
      // Ensure all instructions have valid distances
      instructions = instructions.map((step, index) => {
        // Parse the distance
        let stepDistance = parseFloat(step.distance);
        
        // If distance is invalid, calculate based on position
        if (isNaN(stepDistance) || stepDistance === 0) {
          const totalDistance = parseFloat(route.distance) || 2.5;
          const progress = (index + 1) / (instructions.length + 1);
          stepDistance = totalDistance * progress;
        }
        
        return {
          number: step.number || index + 1,
          action: step.action || (index === instructions.length - 1 ? 'Arrive at' : 'Continue'),
          street: step.street || (index === instructions.length - 1 ? getSelectedSchoolName() : 'Street'),
          distance: stepDistance.toFixed(1),
          icon: step.icon || getIconForStep(index, instructions.length),
          color: step.color || '#3b82f6'
        };
      });
      
      // Generate HTML for instructions
      const instructionsHTML = instructions.map(step => {
        return `
          <div class="instruction-step">
            <div class="step-number">${step.number}</div>
            <div>
              <div class="step-text">${step.action} <strong>${step.street}</strong>
                <i class="fas ${step.icon}" style="color: ${step.color}; margin-left: 5px;"></i>
              </div>
              <div class="step-distance">${step.distance} miles</div>
            </div>
          </div>
        `;
      }).join('');
      
      routeInstructions.innerHTML = instructionsHTML;
    }
    
    // Initialize preview map
    initPreviewMap(route);
    
  } catch (error) {
    console.error('Error displaying route preview:', error);
    showNotification('Error displaying route', 'error');
  }
}




function initPreviewMap(route) {
  try {
    const previewMapDiv = document.getElementById('previewMap');
    if (!previewMapDiv) {
      console.error('previewMap div not found!');
      return;
    }
    
    // Clear previous map if exists
    if (previewMap) {
      previewMap.remove();
    }
    
    // Create new map
    const centerLat = (route.start.lat + route.end.lat) / 2;
    const centerLng = (route.start.lng + route.end.lng) / 2;
    
    previewMap = L.map('previewMap').setView([centerLat, centerLng], 14);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(previewMap);
    
    // Add start marker
    const startIcon = L.divIcon({
      html: '<i class="fas fa-map-marker-alt" style="color: #ef4444; font-size: 32px;"></i>',
      iconSize: [32, 32],
      className: 'start-marker'
    });
    
    L.marker([route.start.lat, route.start.lng], { icon: startIcon })
      .addTo(previewMap)
      .bindPopup('<strong>Starting Point</strong>');
    
    // Add end marker (school)
    const endIcon = L.divIcon({
      html: '<i class="fas fa-school" style="color: #3b82f6; font-size: 32px;"></i>',
      iconSize: [32, 32],
      className: 'end-marker'
    });
    
    L.marker([route.end.lat, route.end.lng], { icon: endIcon })
      .addTo(previewMap)
      .bindPopup(`<strong>${route.schoolName}</strong>`);
    
    // Add hazard markers if not avoiding them
    if (!route.avoidHazards) {
      allHazards.forEach(hazard => {
        const hazardType = HAZARD_TYPES[hazard.type] || HAZARD_TYPES.other;
        const hazardIcon = L.divIcon({
          html: `<i class="fas ${hazardType.icon}" style="color: ${hazardType.color}; font-size: 24px;"></i>`,
          iconSize: [24, 24],
          className: 'hazard-marker'
        });
        
        L.marker([hazard.lat, hazard.lng], { icon: hazardIcon })
          .addTo(previewMap)
          .bindPopup(`<strong>${hazardType.name}</strong><br>${hazard.description || 'Reported hazard'}`);
      });
    }
    
    // Add route line
    const lineColor = route.avoidHazards ? 
      (route.safetyLevel === 'excellent' ? '#10b981' : 
       route.safetyLevel === 'good' ? '#3b82f6' : '#f59e0b') :
      '#ef4444';
    
    if (route.waypoints && route.waypoints.length > 1) {
      previewRouteLayer = L.polyline(route.waypoints, {
        color: lineColor,
        weight: 6,
        opacity: 0.8,
        dashArray: route.avoidHazards ? null : '10, 10'
      }).addTo(previewMap);
    }
    
    // Fit bounds
    if (route.waypoints && route.waypoints.length > 0) {
      const bounds = L.latLngBounds(route.waypoints);
      previewMap.fitBounds(bounds, { padding: [50, 50] });
    }
  } catch (error) {
    console.error('Error initializing preview map:', error);
  }
}

// ========== MAP INITIALIZATION WITH LOCATION ==========
function initMap() {
  try {
    if (mapInitialized || !document.getElementById('map')) return;
    
    console.log('Initializing map...');
    mapInitialized = true;
    
    // Try to center map on user's location if available
    let initialCenter = HOWARD_COUNTY.center;
    let initialZoom = 12;
    
    if (userLocation) {
      initialCenter = [userLocation.lat, userLocation.lng];
      initialZoom = 14;
    }
    
    map = L.map('map').setView(initialCenter, initialZoom);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);
    
    // Add Howard County boundary polygon
    const countyBounds = [
      [HOWARD_COUNTY.bounds.north, HOWARD_COUNTY.bounds.west],
      [HOWARD_COUNTY.bounds.north, HOWARD_COUNTY.bounds.east],
      [HOWARD_COUNTY.bounds.south, HOWARD_COUNTY.bounds.east],
      [HOWARD_COUNTY.bounds.south, HOWARD_COUNTY.bounds.west]
    ];
    
    L.polygon(countyBounds, {
      color: '#3b82f6',
      weight: 2,
      opacity: 0.3,
      fillOpacity: 0.1,
      fillColor: '#3b82f6'
    }).addTo(map).bindPopup('<strong>Howard County Boundary</strong>');
    
    // Add user location marker if available
    if (userLocation) {
      userLocationMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({
          html: '<i class="fas fa-location-dot" style="color: #3b82f6; font-size: 32px;"></i>',
          iconSize: [32, 32],
          className: 'user-location-marker'
        })
      }).addTo(map)
        .bindPopup('<strong>Your Current Location</strong>');
    }
    
    // Add schools
    Object.values(howardCountySchools).forEach(school => {
      const icon = L.divIcon({
        html: '<i class="fas fa-school" style="color: #3b82f6; font-size: 24px;"></i>',
        iconSize: [24, 24],
        className: 'school-marker'
      });
      
      L.marker([school.lat, school.lng], { icon: icon })
        .addTo(map)
        .bindPopup(`<strong>${school.name}</strong><br>${school.address || ''}`);
    });
    
    // Add crosswalks
    howardCountyCrosswalks.forEach(crosswalk => {
      const crosswalkIcon = L.divIcon({
        html: '<i class="fas fa-person-walking" style="color: #8b5cf6; font-size: 20px;"></i>',
        iconSize: [20, 20],
        className: 'crosswalk-marker'
      });
      
      L.marker([crosswalk.lat, crosswalk.lng], { icon: crosswalkIcon })
        .addTo(map)
        .bindPopup(`<strong>${crosswalk.street}</strong><br>${crosswalk.type} crosswalk`);
    });
    
  } catch (error) {
    console.error('Error initializing map:', error);
  }
}

// ========== NOTIFICATION SYSTEM ==========
function showNotification(message, type = 'info') {
  try {
    console.log(`Notification: ${message}`);
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      ${message}
    `;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 400px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 4000);
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  try {
    // Search functionality
    const addressSearch = document.getElementById('addressSearch');
    if (addressSearch) {
      addressSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchAddress();
        }
      });
    }
    
    // Hazard form
    const hazardForm = document.getElementById('hazardForm');
    if (hazardForm) {
      hazardForm.addEventListener('submit', function(e) {
        e.preventDefault();
        submitHazardReport();
      });
    }
    
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}

async function searchAddress() {
  const address = document.getElementById('addressSearch').value;
  if (address) {
    showNotification(`Searching for: ${address}`, 'info');
    
    try {
      const coords = await geocodeAddress(address);
      if (map) {
        map.setView([coords.lat, coords.lng], 15);
        
        // Add marker for searched location
        L.marker([coords.lat, coords.lng], {
          icon: L.divIcon({
            html: '<i class="fas fa-map-marker-alt" style="color: #ef4444; font-size: 32px;"></i>',
            iconSize: [32, 32]
          })
        }).addTo(map)
          .bindPopup(`<strong>${address}</strong>`)
          .openPopup();
        
        showNotification(`Found location for: ${address}`, 'success');
      }
    } catch (error) {
      showNotification(`Could not find location for: ${address}`, 'error');
    }
  }
}

function locateUser() {
  useCurrentLocation();
}

function changeMapLayer(layer) {
  showNotification(`Map view changed to ${layer}`, 'info');
}

function zoomToRoute() {
  if (previewMap && currentRoute) {
    const bounds = L.latLngBounds(currentRoute.waypoints);
    previewMap.fitBounds(bounds, { padding: [20, 20] });
    showNotification('Zoomed to route', 'info');
  }
}

function clearRoute() {
  const placeholder = document.getElementById('routePlaceholder');
  const previewContainer = document.getElementById('routePreviewContainer');
  
  if (placeholder) placeholder.style.display = 'flex';
  if (previewContainer) previewContainer.style.display = 'none';
  currentRoute = null;
  
  if (previewMap) {
    previewMap.remove();
    previewMap = null;
  }
  
  // Clear route options
  const routeOptions = document.getElementById('routeOptions');
  if (routeOptions) {
    routeOptions.remove();
  }
  
  showNotification('Route cleared', 'info');
}

function shareRoute() {
  if (!currentRoute) return;
  
  const shareText = `Check out my ${currentRoute.avoidHazards ? 'safe' : 'direct'} route to ${currentRoute.schoolName}`;
  navigator.clipboard.writeText(shareText);
  showNotification('Route details copied to clipboard!', 'success');
}

function printRoute() {
  window.print();
}

// ========== ROUTE SAVING SYSTEM ==========
function saveRoute() {
  if (!currentRoute) {
    showNotification('No route to save', 'warning');
    return;
  }
  
  try {
    // Generate a unique ID for the route
    const routeId = 'route_' + Date.now();
    
    // Create a route object with metadata
    const routeToSave = {
      id: routeId,
      name: `Route to ${currentRoute.schoolName} ${currentRoute.avoidHazards ? '(Safe)' : '(Direct)'} ${currentRoute.isValhallaRoute ? '[Valhalla]' : '[Local]'}`,
      date: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      ...currentRoute
    };
    
    // Add to saved routes
    savedRoutes.unshift(routeToSave);
    
    // Limit to 20 saved routes
    if (savedRoutes.length > 20) {
      savedRoutes = savedRoutes.slice(0, 20);
    }
    
    // Save to localStorage
    localStorage.setItem('safeRoutesSavedRoutes', JSON.stringify(savedRoutes));
    
    // Update stats
    updateStats();
    
    showNotification('Route saved successfully!', 'success');
    
    // If we're in the saved routes view, refresh it
    if (document.getElementById('saved-routes-view').style.display === 'block') {
      loadSavedRoutes();
    }
  } catch (error) {
    console.error('Error saving route:', error);
    showNotification('Error saving route', 'error');
  }
}

function loadSavedRoutes() {
  const container = document.getElementById('savedRoutesContainer');
  if (!container) return;
  
  try {
    if (savedRoutes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-route"></i>
          <h3>No saved routes yet</h3>
          <p>Find and save routes in the Route Finder tab</p>
          <button class="btn btn-primary" onclick="showView('route-finder')">
            <i class="fas fa-directions"></i> Find Routes
          </button>
        </div>
      `;
      return;
    }
    
    let html = `
      <div class="saved-routes-header">
        <div>
          <h3><i class="fas fa-route"></i> Saved Routes</h3>
          <p class="text-muted">${savedRoutes.length} saved route${savedRoutes.length === 1 ? '' : 's'}</p>
        </div>
        <button class="btn btn-primary" onclick="showView('route-finder')">
          <i class="fas fa-plus"></i> Find New Route
        </button>
      </div>
      <div class="saved-routes-list">
    `;
    
    savedRoutes.forEach((route, index) => {
      html += `
        <div class="saved-route-card">
          <div class="saved-route-header">
            <div>
              <h4>${route.name}</h4>
              <div class="saved-route-date">
                <i class="fas fa-calendar"></i> Saved on ${route.date}
              </div>
            </div>
            <div class="saved-route-actions">
              <button class="btn btn-sm btn-secondary" onclick="viewSavedRoute(${index})">
                <i class="fas fa-eye"></i> View
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteSavedRoute('${route.id}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          
          <div class="saved-route-details">
            <div class="saved-route-school">
              <i class="fas fa-school"></i> ${route.schoolName}
            </div>
            
            <div class="saved-route-stats">
              <div class="saved-route-stat">
                <i class="fas fa-ruler" style="color: #3b82f6;"></i>
                <span>${route.distance} mi</span>
              </div>
              <div class="saved-route-stat">
                <i class="fas fa-clock" style="color: #10b981;"></i>
                <span>${route.walkingTime} min</span>
              </div>
              <div class="saved-route-stat">
                <i class="fas fa-shield-alt" style="color: ${route.safetyLevel === 'excellent' ? '#10b981' : route.safetyLevel === 'good' ? '#3b82f6' : '#f59e0b'}"></i>
                <span>${route.safetyScore}/100</span>
              </div>
              <div class="saved-route-stat">
                <i class="fas ${route.isValhallaRoute ? 'fa-server' : 'fa-laptop'}" style="color: ${route.isValhallaRoute ? '#7c3aed' : '#06b6d4'}"></i>
                <span>${route.isValhallaRoute ? 'Valhalla' : 'Local'}</span>
              </div>
            </div>
            
            <div class="saved-route-hazards">
              <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
              <span>${route.avoidHazards ? 'Avoids' : 'May encounter'} ${route.hazardsAvoided} hazard${route.hazardsAvoided === 1 ? '' : 's'}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Error loading saved routes:', error);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Routes</h3>
        <p>There was an error loading your saved routes</p>
        <button class="btn btn-primary" onclick="loadSavedRoutes()">
          <i class="fas fa-redo"></i> Try Again
        </button>
      </div>
    `;
  }
}

function viewSavedRoute(index) {
  try {
    if (index >= 0 && index < savedRoutes.length) {
      currentRoute = savedRoutes[index];
      showView('route-finder');
      displayRoutePreview(currentRoute);
      showNotification('Loaded saved route', 'success');
    }
  } catch (error) {
    console.error('Error viewing saved route:', error);
    showNotification('Error loading route', 'error');
  }
}

function deleteSavedRoute(routeId) {
  try {
    if (confirm('Are you sure you want to delete this route?')) {
      savedRoutes = savedRoutes.filter(route => route.id !== routeId);
      localStorage.setItem('safeRoutesSavedRoutes', JSON.stringify(savedRoutes));
      loadSavedRoutes();
      updateStats();
      showNotification('Route deleted', 'success');
    }
  } catch (error) {
    console.error('Error deleting route:', error);
    showNotification('Error deleting route', 'error');
  }
}

// ========== HAZARD REPORTING SYSTEM ==========
function loadHazards() {
  try {
    // Hazards are already loaded in loadSavedData()
    updateStats();
  } catch (error) {
    console.error('Error loading hazards:', error);
    allHazards = [];
  }
}

function startHazardReport() {
  showHazardModal();
}

function showHazardModal() {
  const modal = document.getElementById('hazardModal');
  if (!modal) return;
  
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  reportModalOpen = true;
  
  // Reset form
  document.getElementById('hazardForm').reset();
  const hazardError = document.getElementById('hazardError');
  if (hazardError) hazardError.style.display = 'none';
  selectedHazardLocation = null;
}

function closeHazardModal() {
  const modal = document.getElementById('hazardModal');
  if (!modal) return;
  
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
  reportModalOpen = false;
}

function submitHazardReport() {
  try {
    const locationInput = document.getElementById('hazardLocation');
    const typeSelect = document.getElementById('hazardType');
    const descriptionTextarea = document.getElementById('hazardDescription');
    const timeSelect = document.getElementById('hazardTime');
    const hazardError = document.getElementById('hazardError');
    
    if (!locationInput || !typeSelect || !descriptionTextarea) {
      showNotification('Form elements not found', 'error');
      return;
    }
    
    const location = locationInput.value.trim();
    const type = typeSelect.value;
    const description = descriptionTextarea.value.trim();
    
    // Validate inputs
    if (!location || !type || !description) {
      if (hazardError) {
        hazardError.textContent = 'Please fill in all required fields';
        hazardError.style.display = 'block';
      }
      return;
    }
    
    // Create new hazard
    const newHazard = {
      id: 'hazard_' + Date.now(),
      location: location,
      type: type,
      description: description,
      time: timeSelect ? timeSelect.value || 'anytime' : 'anytime',
      status: 'new',
      reportedBy: currentUser ? currentUser.name : 'Anonymous User',
      reportedDate: new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      timestamp: Date.now(),
      lat: locationInput.dataset.lat || (HOWARD_COUNTY.center[0] + (Math.random() * 0.05 - 0.025)),
      lng: locationInput.dataset.lng || (HOWARD_COUNTY.center[1] + (Math.random() * 0.05 - 0.025))
    };
    
    // Add to hazards array
    allHazards.unshift(newHazard);
    
    // Save to localStorage
    localStorage.setItem('safeRoutesHazards', JSON.stringify(allHazards));
    
    // Close modal
    closeHazardModal();
    
    // Show success message
    showNotification('Hazard reported successfully! Routes will now avoid this area.', 'success');
    
    // Reload safety reports if we're on that page
    if (document.getElementById('safety-reports-view').style.display === 'block') {
      loadSafetyReports();
    }
    
    // Update stats
    updateStats();
    
  } catch (error) {
    console.error('Error submitting hazard report:', error);
    showNotification('Error reporting hazard', 'error');
  }
}

function loadSafetyReports() {
  const container = document.getElementById('reportsContainer');
  if (!container) return;
  
  try {
    if (allHazards.length === 0) {
      container.innerHTML = `
        <div class="empty-reports">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>No Hazard Reports Yet</h3>
          <p>Be the first to report a safety hazard in Howard County</p>
          <button class="btn btn-primary" onclick="startHazardReport()">
            <i class="fas fa-plus"></i> Report First Hazard
          </button>
        </div>
      `;
      return;
    }
    
    let html = `
      <div class="reports-header">
        <div>
          <h3><i class="fas fa-exclamation-triangle"></i> Reported Hazards</h3>
          <p class="text-muted">${allHazards.length} hazard${allHazards.length === 1 ? '' : 's'} reported in Howard County</p>
        </div>
        <button class="btn btn-primary" onclick="startHazardReport()">
          <i class="fas fa-plus"></i> Report New Hazard
        </button>
      </div>
      <div class="reports-list">
    `;
    
    allHazards.forEach(hazard => {
      const hazardType = HAZARD_TYPES[hazard.type] || HAZARD_TYPES.other;
      
      html += `
        <div class="report-card ${hazard.type}">
          <div class="report-header">
            <div class="report-title" style="color: ${hazardType.color};">
              <i class="fas ${hazardType.icon}"></i>
              ${hazardType.name}
            </div>
            <span class="report-status status-${hazard.status}">
              ${hazard.status === 'new' ? '🆕 New' : hazard.status === 'review' ? '👁‍🗨 Under Review' : '✅ Resolved'}
            </span>
          </div>
          
          <div class="report-location">
            <i class="fas fa-map-marker-alt"></i>
            ${hazard.location}
          </div>
          
          <div class="report-description">
            ${hazard.description}
          </div>
          
          <div class="report-footer">
            <div class="report-meta">
              <div class="report-date">
                <i class="fas fa-calendar"></i>
                ${hazard.reportedDate}
              </div>
              <div>
                <i class="fas fa-user"></i>
                ${hazard.reportedBy}
              </div>
            </div>
            <div class="report-actions">
              <button class="btn btn-sm btn-secondary" onclick="viewHazardOnMap(${hazard.lat}, ${hazard.lng})">
                <i class="fas fa-map"></i> View on Map
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading safety reports:', error);
  }
}

function viewHazardOnMap(lat, lng) {
  showView('dashboard');
  if (map) {
    map.setView([lat, lng], 16);
    showNotification('Showing hazard location on map', 'info');
  }
}

// ========== STATS FUNCTIONS ==========
function updateStats() {
  try {
    // Update hazard count
    const hazardCount = document.getElementById('hazardCount');
    if (hazardCount) {
      hazardCount.textContent = allHazards.length;
    }
    
    // Update school count
    const schoolCount = document.querySelector('.stat-card:nth-child(1) .stat-number');
    if (schoolCount) {
      schoolCount.textContent = Object.keys(howardCountySchools).length || 12;
    }
    
    // Update user count
    const userCount = document.getElementById('userCount');
    if (userCount) {
      userCount.textContent = 125; // Demo number
    }
    
    // Update route count
    const routeCount = document.getElementById('routeCount');
    if (routeCount) {
      routeCount.textContent = savedRoutes.length;
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// ========== ACCOUNT FUNCTIONS ==========
function loadAccountInfo() {
  const container = document.getElementById('accountContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-user"></i>
      <h3>Account</h3>
      <p>Account features coming soon</p>
    </div>
  `;
}

function loadWalkGroups() {
  const container = document.getElementById('walkGroupsContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-users"></i>
      <h3>Walk Groups Coming Soon</h3>
      <p>This feature is under development</p>
    </div>
  `;
}

function showAuthModal(mode = 'login') {
  showNotification('For demo: Enter any location and select a school to find routes', 'info');
}

function logout() {
  currentUser = null;
  localStorage.removeItem('safeRoutesCurrentUser');
  showNotification('Logged out successfully', 'success');
  showView('dashboard');
}

// ========== ADD CSS STYLES ==========
document.addEventListener('DOMContentLoaded', function() {
  const routeOptionsCSS = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    
    .route-options-header {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .route-options-grid {
      display: grid;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .route-option-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .route-option-card:hover {
      border-color: #3b82f6;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .route-option-card.selected {
      border-color: #3b82f6;
      background: #f0f9ff;
    }
    
    .route-option-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    
    .route-option-header h5 {
      margin: 0 0 5px 0;
      font-size: 16px;
      color: #1f2937;
    }
    
    .route-option-subtitle {
      display: flex;
      gap: 15px;
      font-size: 12px;
      color: #6b7280;
    }
    
    .route-option-subtitle span {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .recommended-badge {
      background: #10b981;
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .valhalla-badge {
      background: #7c3aed;
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      margin-left: 8px;
    }
    
    .route-option-details {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 15px 0;
    }
    
    .route-option-stat {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #4b5563;
    }
    
    .route-option-actions {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    
    .user-location-marker {
      filter: drop-shadow(0 2px 4px rgba(59, 130, 246, 0.5));
    }
  `;
  
  const style = document.createElement('style');
  style.textContent = routeOptionsCSS;
  document.head.appendChild(style);
});

function getColorFromAction(action) {
  const lowerAction = action.toLowerCase();
  if (lowerAction.includes('start')) return '#10b981';
  if (lowerAction.includes('turn right')) return '#f59e0b';
  if (lowerAction.includes('turn left')) return '#ef4444';
  if (lowerAction.includes('sharp')) return '#dc2626';
  if (lowerAction.includes('slight')) return '#8b5cf6';
  if (lowerAction.includes('u-turn')) return '#7c3aed';
  if (lowerAction.includes('arrive')) return '#8b5cf6';
  return '#3b82f6'; // default blue for continue/straight
}


function getIconForStep(stepIndex, totalSteps) {
  if (stepIndex === 0) return 'fa-walking';
  if (stepIndex === totalSteps - 1) return 'fa-school';
  
  // Alternate between arrow icons for middle steps
  const icons = ['fa-arrow-up', 'fa-arrow-right', 'fa-arrow-left', 'fa-road'];
  return icons[stepIndex % icons.length];
}