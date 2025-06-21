       
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import {
            getAuth,
            GoogleAuthProvider,
            signInWithPopup,
            signOut,
            onAuthStateChanged,
            signInWithCustomToken,
            signInAnonymously
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import {
            getFirestore,
            collection,
            addDoc,
            query,
            where,
            orderBy,
            onSnapshot,
            serverTimestamp
        } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

       
       
       // Global variables for Firebase config and app ID
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = {
            apiKey: "AIzaSyBl6-Cfz8fvgxWcExEdqEHQ6NsMNLIT0AQ",
            authDomain: "hitchpoint-fabef.firebaseapp.com",
            projectId: "hitchpoint-fabef",
            storageBucket: "hitchpoint-fabef.firebasestorage.app",
            messagingSenderId: "662205524100",
            appId: "1:662205524100:web:73c4c532c16fcaceee7ad1",
            measurementId: "G-SBKJNWMBNM",
            googleMapsApiKey: "AIzaSyCOBPhsHs2BEdz7DTEofxUxlWKPCzY3Qkk" 
        };
        // This will override or merge with the default firebaseConfig if __firebase_config is provided by the environment.
        const providedFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        Object.assign(firebaseConfig, providedFirebaseConfig);


        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        let app, auth, db;
        let currentUserId = null;
        let currentUserEmail = null;
        let isAuthReady = false; // Flag to indicate if auth state is settled

        // Google Maps variables
        let map;
        let directionsService;
        let directionsRenderer;
        let originAutocomplete;
        let destinationAutocomplete;
        let currentRouteData = null; // To store route details for quote
        let geocoder; // Declare geocoder
        let mapClickListenerHandle = null; // To store the map click listener
        let mapSelectionMode = 'none'; // 'none', 'origin', 'destination'
        let originMarker = null;
        let destinationMarker = null;

        // Debounce utility function
        const debounce = (func, delay) => {
            let timeoutId;
            return function(...args) {
                // Clear the previous timeout if user types again
                clearTimeout(timeoutId);
                
                // Set a new timeout
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                }, delay);
            };
        };

        // --- Firebase Initialization and Authentication ---
        const initFirebase = async () => {
            try {
                app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);

                // Listen for authentication state changes
                onAuthStateChanged(auth, async (user) => {
                    isAuthReady = true; // Auth state is now settled
                    if (user) {
                        currentUserId = user.uid;
                        currentUserEmail = user.email || "N/A";
                        document.getElementById('logged-out-view').classList.add('hidden');
                        document.getElementById('logged-in-view').classList.remove('hidden');
                        document.getElementById('user-email').textContent = currentUserEmail;
                        document.getElementById('user-id').textContent = currentUserId;
                        document.getElementById('ride-request-section').classList.remove('hidden');
                        // Show the 'View Ride History' button only when logged in
                        document.getElementById('view-history-btn').classList.remove('hidden');
                        console.log("User logged in, listening for ride history...");
                        listenForRideHistory(); // Start listening for history once logged in
                    } else {
                        currentUserId = null;
                        currentUserEmail = null;
                        document.getElementById('logged-out-view').classList.remove('hidden');
                        document.getElementById('logged-in-view').classList.add('hidden');
                        document.getElementById('ride-request-section').classList.add('hidden');
                        document.getElementById('view-history-btn').classList.add('hidden'); // Hide button when logged out
                        document.getElementById('ride-history-body').innerHTML = ''; // Clear history
                    }
                    hideLoadingOverlay();
                });

                // Sign in with custom token or anonymously if token not provided
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }

            } catch (error) {
                console.error("Error initializing Firebase:", error);
                showModal("Error", "Failed to initialize the app. Please try again later.");
                hideLoadingOverlay();
            }
        };

        const googleLogin = async () => {
            showLoadingOverlay();
            try {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
                // onAuthStateChanged will handle UI updates
            } catch (error) {
                console.error("Google Sign-In Error:", error);
                if (error.code !== 'auth/popup-closed-by-user') {
                     showModal("Login Failed", "Could not sign in with Google. Please try again.");
                }
                hideLoadingOverlay();
            }
        };

        const googleLogout = async () => {
            showLoadingOverlay();
            try {
                await signOut(auth);
                // onAuthStateChanged will handle UI updates
            }
            catch (error) {
                console.error("Google Sign-Out Error:", error);
                showModal("Logout Failed", "Could not log out. Please try again.");
                hideLoadingOverlay();
            }
        };

        // --- Google Maps Integration ---
        const loadGoogleMapsScript = (apiKey) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMap`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
            script.onerror = () => {
                showModal("Map Error", "Failed to load Google Maps. Please check your API key and network connection.");
                hideLoadingOverlay();
            };
        };

        window.initMap = () => {
            // Check if map is already initialized to prevent re-initialization
            if (map) return;

            map = new google.maps.Map(document.getElementById('map'), {
                // Centering on Kingstown, St. Vincent and the Grenadines
                center: { lat: 13.1592, lng: -61.2185 },
                zoom: 12,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false
            });

            directionsService = new google.maps.DirectionsService();
            directionsRenderer = new google.maps.DirectionsRenderer({
                map: map,
                panel: null, // We will not display directions in a separate panel
                polylineOptions: {
                    strokeColor: '#3b82f6', // Primary brand color
                    strokeOpacity: 0.8,
                    strokeWeight: 6
                }
            });

            geocoder = new google.maps.Geocoder(); // Initialize Geocoder

            const originInput = document.getElementById('origin-input');
            const destinationInput = document.getElementById('destination-input');
            
            // Country restriction for St. Vincent and the Grenadines
            const countryRestriction = { country: 'vc' };
            
            // Create autocomplete instances but don't attach them yet
            originAutocomplete = new google.maps.places.Autocomplete(originInput, {
                componentRestrictions: countryRestriction
            });
            destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, {
                componentRestrictions: countryRestriction
            });
            
            // Disable default autocomplete behavior to implement custom debouncing
            originInput.setAttribute('autocomplete', 'off');
            destinationInput.setAttribute('autocomplete', 'off');
            
            // Create debounced search functions
            const debouncedOriginSearch = debounce((value) => {
                if (value.length >= 3) { // Only search after 3 characters
                    searchPlace(value, 'origin');
                }
            }, 300);
            
            const debouncedDestinationSearch = debounce((value) => {
                if (value.length >= 3) {
                    searchPlace(value, 'destination');
                }
            }, 300);
            
            // Add input event listeners
            originInput.addEventListener('input', (e) => {
                debouncedOriginSearch(e.target.value);
            });
            
            destinationInput.addEventListener('input', (e) => {
                debouncedDestinationSearch(e.target.value);
            });

            // Bias the Autocomplete results towards the map's viewport.
            map.addListener('bounds_changed', () => {
                originAutocomplete.setBounds(map.getBounds());
                destinationAutocomplete.setBounds(map.getBounds());
            });
        };

                // Function to display predictions in the autocomplete dropdown
                 const searchPlace = (query, inputType) => {
                // Show loading indicator (optional)
                const inputElement = document.getElementById(`${inputType}-input`);
                inputElement.classList.add('searching');
                
                // Create autocomplete service
                const service = new google.maps.places.AutocompleteService();
                
                // Search parameters
                const request = {
                    input: query,
                    componentRestrictions: { country: 'vc' },
                    // Bias results to current map bounds
                    locationBias: map.getBounds()
                };
                
                // Perform the search
                service.getPlacePredictions(request, (predictions, status) => {
                    inputElement.classList.remove('searching');
                    
                    if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                        displayPredictions(predictions, inputType);
                    } else {
                        console.log('Place search failed:', status);
                        clearPredictions(inputType);
                    }
                });
            };

            // Function to display predictions in a dropdown
            const displayPredictions = (predictions, inputType) => {
                const inputElement = document.getElementById(`${inputType}-input`);
                const existingDropdown = document.getElementById(`${inputType}-predictions`);
                
                // Remove existing dropdown if any
                if (existingDropdown) {
                    existingDropdown.remove();
                }
                
                // Create new dropdown
                const dropdown = document.createElement('div');
                dropdown.id = `${inputType}-predictions`;
                dropdown.className = 'autocomplete-dropdown';
                
                predictions.slice(0, 5).forEach(prediction => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.innerHTML = `
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${prediction.description}</span>
                    `;
                    
                    item.addEventListener('click', () => {
                        inputElement.value = prediction.description;
                        clearPredictions(inputType);
                        
                        // Optional: Center map on selected location
                        const placeService = new google.maps.places.PlacesService(map);
                        placeService.getDetails({
                            placeId: prediction.place_id,
                            fields: ['geometry']
                        }, (place, status) => {
                            if (status === google.maps.places.PlacesServiceStatus.OK && place.geometry) {
                                map.setCenter(place.geometry.location);
                                map.setZoom(15);
                            }
                        });
                    });
                    
                    dropdown.appendChild(item);
                });
                
                // Position dropdown below input
                inputElement.parentElement.appendChild(dropdown);
            };

            const clearPredictions = (inputType) => {
                const dropdown = document.getElementById(`${inputType}-predictions`);
                if (dropdown) {
                    dropdown.remove();
                }
            };

            // Close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.input-with-button')) {
                    clearPredictions('origin');
                    clearPredictions('destination');
                }
            });

        // Function to handle map clicks for setting origin/destination
        const handleMapClick = (event) => {
            if (mapSelectionMode === 'none') return;

            showLoadingOverlay();

            geocoder.geocode({ 'location': event.latLng }, (results, status) => {
                hideLoadingOverlay();
                console.log("Geocoder status:", status); // Add this for debugging
                if (status === 'OK') {
                    if (results[0]) {
                        const address = results[0].formatted_address;
                        if (mapSelectionMode === 'origin') {
                            document.getElementById('origin-input').value = address;
                            if (originMarker) originMarker.setMap(null); // Clear previous marker
                            originMarker = new google.maps.Marker({
                                position: event.latLng,
                                map: map,
                                title: 'Origin'
                            });
                        } else if (mapSelectionMode === 'destination') {
                            document.getElementById('destination-input').value = address;
                            if (destinationMarker) destinationMarker.setMap(null); // Clear previous marker
                            destinationMarker = new google.maps.Marker({
                                position: event.latLng,
                                map: map,
                                title: 'Destination',
                                icon: {
                                    url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png" // Green marker for destination
                                }
                            });
                        }
                        setMapSelectionMode('none'); // Exit map selection mode
                    } else {
                        showModal("Location Error", "No address found for this location.");
                    }
                } else {
                    // Enhanced error message for Geocoder failure
                    showModal("Geocoder failed", `Due to: ${status}. Please check your Google Maps API key and ensure Geocoding API is enabled for it in Google Cloud Console.`);
                }
            });
        };

        // Function to set or clear map click listener based on mode
        const setMapSelectionMode = (mode) => {
            mapSelectionMode = mode;
            if (mapClickListenerHandle) {
                google.maps.event.removeListener(mapClickListenerHandle); // Remove old listener
                mapClickListenerHandle = null;
            }

            if (mode !== 'none') {
                mapClickListenerHandle = map.addListener('click', handleMapClick);
                showModal("Map Selection Active", `Click on the map to set your ${mode} location.`);
            }
        };

        const calculateRoute = () => {
            const origin = document.getElementById('origin-input').value;
            const destination = document.getElementById('destination-input').value;

            if (!origin || !destination) {
                showModal("Input Required", "Please enter both origin and destination.");
                return;
            }

            // Clear any existing markers from direct map selection
            if (originMarker) originMarker.setMap(null);
            if (destinationMarker) destinationMarker.setMap(null);
            originMarker = null;
            destinationMarker = null;


            showLoadingOverlay();

            directionsService.route(
                {
                    origin: origin,
                    destination: destination,
                    travelMode: google.maps.TravelMode.DRIVING,
                    // To encourage a coastal route, a waypoint in Calliaqua is added.
                    // This forces the route to pass through Calliaqua. Be aware that for very
                    // specific origin/destination pairs, this might make the route slightly longer
                    // than a direct inland path if Google's default optimization finds one.
                    // This is a heuristic to favor the generally preferred coastal roads.
                    waypoints: [{
                        location: { lat: 13.1333, lng: -61.1667 }, // Calliaqua, St. Vincent
                        stopover: false
                    }],
                    optimizeWaypoints: false // Ensure the waypoint is visited in the specified order
                },
                (response, status) => {
                    hideLoadingOverlay();
                    if (status === 'OK') {
                        directionsRenderer.setDirections(response);
                        const route = response.routes[0].legs[0];
                        const distanceMeters = route.distance.value;
                        const durationSeconds = route.duration.value;

                        // Calculate fare (e.g., $15 base + $2.50 per mile + $0.25 per minute)
                        const baseFare = 15.00;
                        const perMileRate = 2.50;
                        const perMinuteRate = 0.25;

                        const distanceMiles = distanceMeters / 1609.34; // meters to miles
                        const durationMinutes = durationSeconds / 60; // seconds to minutes

                        const fare = baseFare + (distanceMiles * perMileRate) + (durationMinutes * perMinuteRate);

                        currentRouteData = {
                            origin: origin,
                            destination: destination,
                            distance: route.distance.text,
                            duration: route.duration.text,
                            fare: fare.toFixed(2),
                            timestamp: new Date().toISOString()
                        };

                        // Display quote in its modal
                        document.getElementById('quote-distance').textContent = route.distance.text;
                        document.getElementById('quote-duration').textContent = route.duration.text;
                        document.getElementById('quote-fare').textContent = `$${fare.toFixed(2)}`;
                        // Show the quote modal
                        document.getElementById('quote-display-modal').classList.add('show');

                        // Prompt to save ride immediately after quote modal is shown
                        showModal(
                            "Save Ride?",
                            "Would you like to save this ride request to your history?",
                            true,
                            (confirmed) => {
                                if (confirmed) {
                                    saveRideRequest(currentRouteData);
                                } else {
                                    currentRouteData = null;
                                }
                            }
                        );
                    } else {
                        showModal("Route Error", `Could not find a route: ${status}. Please try again with different locations.`);
                        directionsRenderer.setDirections({ routes: [] }); // Clear any previous route
                        currentRouteData = null;
                    }
                }
            );
        };

        // --- Firestore Data Operations ---
        const saveRideRequest = async (rideData) => {
            if (!currentUserId) {
                showModal("Authentication Required", "Please log in to save your ride request.");
                return;
            }
            if (!isAuthReady) {
                showModal("Loading", "Authentication is still loading. Please wait a moment.");
                return;
            }

            showLoadingOverlay();
            try {
                // Store private user data
                const userRidesCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/rides`);
                await addDoc(userRidesCollectionRef, {
                    ...rideData,
                    userId: currentUserId,
                    timestamp: serverTimestamp() // Use server timestamp for consistency
                });
                showModal("Success", "Your ride request has been saved to your history!");
            } catch (error) {
                console.error("Error saving ride request:", error);
                showModal("Error", "Failed to save ride request. Please try again.");
            } finally {
                hideLoadingOverlay();
            }
        };

        const listenForRideHistory = () => {
             if (!currentUserId || !isAuthReady) {
                console.log("Cannot listen for ride history: not authenticated or auth not ready.");
                // Do not attempt to listen if not authenticated or auth is not ready
                return;
            }
            console.log("Attempting to listen for ride history for user:", currentUserId);


            const userRidesCollectionRef = collection(db, `artifacts/${appId}/users/${currentUserId}/rides`);
            // Note: Firestore's `orderBy` requires an index for multiple fields.
            // For simplicity and to avoid requiring manual index creation, we'll sort in memory.
            // If you need large datasets and performant sorting, consider adding indexes.
            const q = query(userRidesCollectionRef); // No orderBy here

            // Use onSnapshot for real-time updates
            onSnapshot(q, (snapshot) => {
                console.log("Received ride history snapshot.");
                const rides = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    rides.push({
                        id: doc.id,
                        ...data,
                        // Ensure timestamp is converted to Date object if needed
                        date: data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : 'N/A'
                    });
                });

                // Sort rides by timestamp in descending order (most recent first) in memory
                rides.sort((a, b) => {
                    const dateA = a.timestamp ? new Date(a.timestamp.toDate()).getTime() : 0;
                    const dateB = b.timestamp ? new Date(b.timestamp.toDate()).getTime() : 0;
                    return dateB - dateA;
                });

                displayRideHistory(rides);
            }, (error) => {
                console.error("Error fetching ride history:", error);
                showModal("Error", "Failed to load ride history.");
            });
        };

        const displayRideHistory = (rides) => {
            console.log("Displaying ride history:", rides);
            const historyBody = document.getElementById('ride-history-body');
            historyBody.innerHTML = ''; // Clear existing history

            if (rides.length === 0) {
                historyBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">No ride history found.</td></tr>`;
                // Show the history modal even if empty
                document.getElementById('ride-history-modal').classList.add('show');
                return;
            }

            rides.forEach(ride => {
                const row = historyBody.insertRow();
                row.insertCell().textContent = ride.date;
                row.insertCell().textContent = ride.origin;
                row.insertCell().textContent = ride.destination;
                row.insertCell().textContent = ride.distance;
                row.insertCell().textContent = ride.duration;
                row.insertCell().textContent = `$${ride.fare}`;
            });
            // Show the history modal if this function is called, indicating data is ready to display
            document.getElementById('ride-history-modal').classList.add('show');
        };

        // --- UI Utility Functions ---
        // Make closeModal a global function, accepting an optional modalId to close specific modals
        window.closeModal = (modalId) => {
            let targetModalElement = null;

            if (modalId) {
                targetModalElement = document.getElementById(modalId);
            } else {
                // If no specific ID, close the generic custom-modal (used for alerts/confirms)
                targetModalElement = document.getElementById('custom-modal');
            }

            if (targetModalElement) { // Check if the element exists before manipulating its classList
                targetModalElement.classList.remove('show');
            } else {
                console.warn(`Attempted to close modal with ID "${modalId || 'custom-modal'}" but element was not found in the DOM.`);
            }
            setMapSelectionMode('none'); // Exit map selection mode when any modal is closed
        };

        const showModal = (title, message, isConfirm = false, onConfirm = null) => {
            const modal = document.getElementById('custom-modal');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;

            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');
            const okBtn = document.getElementById('modal-ok-btn');

            confirmBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            okBtn.classList.remove('hidden'); // Default to OK button

            // Remove previous event listeners
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            okBtn.onclick = null;

            if (isConfirm) {
                okBtn.classList.add('hidden');
                confirmBtn.classList.remove('hidden');
                cancelBtn.classList.remove('hidden');

                confirmBtn.onclick = () => {
                    onConfirm && onConfirm(true);
                    window.closeModal();
                };
                cancelBtn.onclick = () => {
                    onConfirm && onConfirm(false);
                    window.closeModal();
                };
            } else {
                okBtn.onclick = window.closeModal;
            }

            modal.classList.add('show');
        };

        const showLoadingOverlay = () => {
            document.getElementById('loading-overlay').style.display = 'flex';
        };

        const hideLoadingOverlay = () => {
            document.getElementById('loading-overlay').style.display = 'none';
        };

        // --- Print Functionality ---
        const printQuote = () => {
            if (!currentRouteData) {
                showModal("No Quote", "Please generate a quote first before printing.");
                return;
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Ride Quote</title>
                    <style>
                        body { font-family: 'Inter', sans-serif; margin: 30px; }
                        h1 { color: #1f2937; font-size: 24px; margin-bottom: 20px; }
                        p { margin-bottom: 10px; line-height: 1.5; }
                        .quote-details {
                            border: 1px solid #e5e7eb;
                            padding: 20px;
                            border-radius: 8px;
                            background-color: #f9fafb;
                        }
                        .fare {
                            font-size: 28px;
                            font-weight: bold;
                            color: #3b82f6;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <h1>Ride Quote</h1>
                    <div class="quote-details">
                        <p><strong>Origin:</strong> ${currentRouteData.origin}</p>
                        <p><strong>Destination:</strong> ${currentRouteData.destination}</p>
                        <p><strong>Distance:</strong> ${currentRouteData.distance}</p>
                        <p><strong>Duration:</strong> ${currentRouteData.duration}</p>
                        <p class="fare"><strong>Estimated Fare:</strong> $${currentRouteData.fare}</p>
                        <p><em>Quote generated on: ${new Date().toLocaleString()}</em></p>
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
        };

        // --- Event Listeners ---
        document.addEventListener('DOMContentLoaded', () => {
            // Check if firebaseConfig has the Google Maps API key before trying to load.
            if (!firebaseConfig.googleMapsApiKey) {
                showModal("Configuration Error", "Google Maps API key is missing from the provided Firebase configuration.");
                hideLoadingOverlay();
            } else {
                showLoadingOverlay(); // Show loading while Firebase and Map initialize
                initFirebase();
                loadGoogleMapsScript(firebaseConfig.googleMapsApiKey);
            }

            document.getElementById('google-login-btn').addEventListener('click', googleLogin);
            document.getElementById('google-logout-btn').addEventListener('click', googleLogout);
            document.getElementById('request-ride-btn').addEventListener('click', () => {
                calculateRoute();
            });
            // Event listener for the Print Quote button now directly attached to the button in the modal
            document.getElementById('print-quote-btn').addEventListener('click', printQuote);

            // New event listeners for map selection buttons
            document.getElementById('select-origin-map-btn').addEventListener('click', () => setMapSelectionMode('origin'));
            document.getElementById('select-destination-map-btn').addEventListener('click', () => setMapSelectionMode('destination'));

            // Event listener for the new "View Ride History" button
            document.getElementById('view-history-btn').addEventListener('click', () => {
                listenForRideHistory(); // This will fetch and display history in the modal
            });
        });