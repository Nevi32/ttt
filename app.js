// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD80v3mBIfPRfsjK-mt_gHr0-pYkvbXf7g",
    authDomain: "footactionn.firebaseapp.com",
    projectId: "footactionn",
    storageBucket: "footactionn.appspot.com",
    messagingSenderId: "89580639624",
    appId: "1:89580639624:web:83473e8b9409f079f5563d",
    measurementId: "G-P807DCTHZR"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global variables
let currentUser = null;
let stores = [];
let currentStoreId = '';
let unsubscribeInventory = null; // To store the Firestore unsubscribe function

// DOM elements
const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const storeSelect = document.getElementById('storeSelect');
const fetchBtn = document.getElementById('fetchBtn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const sizeFilter = document.getElementById('sizeFilter');
const colorFilter = document.getElementById('colorFilter');
const sortSelect = document.getElementById('sortSelect');
const inventoryTable = document.getElementById('inventoryTable');
const itemCount = document.getElementById('itemCount');
const editItemModal = new bootstrap.Modal(document.getElementById('editItemModal'));
const editItemForm = document.getElementById('editItemForm');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

// Current item being edited
let currentEditItem = null;

// Initialize the app
function initApp() {
    showLoading();
    
    // Check if user is already logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in
            currentUser = user;
            initializeAppAfterLogin();
        } else {
            // No user signed in
            hideLoading();
            loginModal.show();
        }
    });
    
    // Set up event listeners
    setupEventListeners();
}

// Initialize app after successful login
async function initializeAppAfterLogin() {
    try {
        // Load stores
        await loadStores();
        
        // Check if we have stores to show
        if (stores.length > 0) {
            hideLoading();
        } else {
            hideLoading();
            alert('No stores found for this account.');
        }
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize app. Please try again.');
        hideLoading();
    }
}

// Set up event listeners
function setupEventListeners() {
    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLogin();
    });
    
    // Inventory management buttons
    fetchBtn.addEventListener('click', fetchInventory);
    searchBtn.addEventListener('click', applyFilters);
    clearSearchBtn.addEventListener('click', clearSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
    sizeFilter.addEventListener('change', applyFilters);
    colorFilter.addEventListener('change', applyFilters);
    sortSelect.addEventListener('change', applyFilters);
    saveChangesBtn.addEventListener('click', saveItemChanges);
}

// Handle login
async function handleLogin() {
    const email = loginEmail.value;
    const password = loginPassword.value;
    
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    
    showLoading();
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        loginModal.hide();
        await initializeAppAfterLogin();
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. ';
        
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage += 'Invalid email format.';
                break;
            case 'auth/user-disabled':
                errorMessage += 'This account has been disabled.';
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorMessage += 'Invalid email or password.';
                break;
            default:
                errorMessage += 'Please try again.';
        }
        
        showError(errorMessage);
    } finally {
        hideLoading();
    }
}

// Show error message
function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove('d-none');
}

// Load stores from Firestore
async function loadStores() {
    try {
        const businessDoc = await db.collection('business').doc(currentUser.uid).get();
        if (businessDoc.exists) {
            stores = businessDoc.data().stores || [];
            populateStoreSelect();
        } else {
            console.log('No business document found for user');
            stores = [];
        }
    } catch (error) {
        console.error('Error loading stores:', error);
        throw error;
    }
}

// Populate store dropdown
function populateStoreSelect() {
    storeSelect.innerHTML = '<option value="">Select a store</option>';
    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        option.textContent = `${store.name} (${store.location})`;
        storeSelect.appendChild(option);
    });
}

// Fetch inventory for selected store with real-time updates
async function fetchInventory() {
    const selectedStoreId = storeSelect.value;
    if (!selectedStoreId) {
        alert('Please select a store first');
        return;
    }
    
    // Unsubscribe from previous listener if exists
    if (unsubscribeInventory) {
        unsubscribeInventory();
    }
    
    currentStoreId = selectedStoreId;
    showLoading();
    
    try {
        // Set up real-time listener for inventory
        unsubscribeInventory = db.collection('users').doc(currentUser.uid)
            .collection('inventory')
            .where('storeId', '==', selectedStoreId)
            .onSnapshot(querySnapshot => {
                const inventoryData = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    data.id = doc.id;
                    return data;
                });
                
                // Update filters and display
                updateFilters(inventoryData);
                applyFilters(inventoryData);
                hideLoading();
            }, error => {
                console.error('Error listening to inventory:', error);
                alert('Failed to fetch inventory. Please check console for details.');
                hideLoading();
            });
    } catch (error) {
        console.error('Error fetching inventory:', error);
        alert('Failed to fetch inventory. Please check console for details.');
        hideLoading();
    }
}

// Update filter dropdowns based on inventory data
function updateFilters(inventoryData) {
    // Get unique sizes and colors
    const sizes = [...new Set(inventoryData.map(item => item.Size))].filter(Boolean).sort();
    const colors = [...new Set(inventoryData.map(item => item.Color))].filter(Boolean).sort();
    
    // Populate size filter
    sizeFilter.innerHTML = '<option value="">All Sizes</option>';
    sizes.forEach(size => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = size;
        sizeFilter.appendChild(option);
    });
    
    // Populate color filter
    colorFilter.innerHTML = '<option value="">All Colors</option>';
    colors.forEach(color => {
        const option = document.createElement('option');
        option.value = color;
        option.textContent = color;
        colorFilter.appendChild(option);
    });
}

// Apply all filters and sorting
async function applyFilters(inventoryData) {
    showLoading();
    
    // If no data passed, query fresh from Firestore
    if (!inventoryData) {
        try {
            const querySnapshot = await db.collection('users').doc(currentUser.uid)
                .collection('inventory')
                .where('storeId', '==', currentStoreId)
                .get();
            
            inventoryData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                data.id = doc.id;
                return data;
            });
        } catch (error) {
            console.error('Error fetching inventory for filters:', error);
            alert('Failed to apply filters. Please try again.');
            hideLoading();
            return;
        }
    }
    
    let results = [...inventoryData];
    
    // Apply search filter (fuzzy match)
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (searchTerm) {
        results = results.filter(item => {
            const productName = item['Product Name']?.toLowerCase() || '';
            return fuzzyMatch(productName, searchTerm);
        });
    }
    
    // Apply size filter
    const selectedSize = sizeFilter.value;
    if (selectedSize) {
        results = results.filter(item => item.Size === selectedSize);
    }
    
    // Apply color filter
    const selectedColor = colorFilter.value;
    if (selectedColor) {
        results = results.filter(item => item.Color === selectedColor);
    }
    
    // Apply sorting
    const sortOption = sortSelect.value;
    results.sort((a, b) => {
        switch (sortOption) {
            case 'size-asc':
                return (a.Size || '').localeCompare(b.Size || '');
            case 'size-desc':
                return (b.Size || '').localeCompare(a.Size || '');
            case 'name-asc':
                return (a['Product Name'] || '').localeCompare(b['Product Name'] || '');
            case 'name-desc':
                return (b['Product Name'] || '').localeCompare(a['Product Name'] || '');
            case 'price-asc':
                return (parseFloat(a.Price || 0) - parseFloat(b.Price || 0));
            case 'price-desc':
                return (parseFloat(b.Price || 0) - parseFloat(a.Price || 0));
            default:
                return 0;
        }
    });
    
    displayInventory(results);
}

// Clear search and filters
async function clearSearch() {
    searchInput.value = '';
    sizeFilter.value = '';
    colorFilter.value = '';
    await applyFilters();
}

// Display inventory in the table
function displayInventory(items) {
    inventoryTable.innerHTML = '';
    
    if (!items || items.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center">No items found</td>';
        inventoryTable.appendChild(row);
        itemCount.textContent = '0 items';
        hideLoading();
        return;
    }
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item['Product Name'] || 'N/A')}</td>
            <td>${escapeHtml(item.Brand || 'N/A')}</td>
            <td>${escapeHtml(item.Color || 'N/A')}</td>
            <td>${escapeHtml(item.Size || 'N/A')}</td>
            <td>${escapeHtml(item.Price || '0')}</td>
            <td>${escapeHtml(item.Quantity || '0')}</td>
            <td>${escapeHtml(getStoreName(item.storeId))}</td>
            <td>
                <button class="btn btn-sm btn-primary action-btn edit-btn" data-id="${escapeHtml(item.id)}">Edit</button>
                <button class="btn btn-sm btn-danger action-btn delete-btn" data-id="${escapeHtml(item.id)}">Delete</button>
            </td>
        `;
        inventoryTable.appendChild(row);
    });
    
    // Update item count
    itemCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
    
    // Add event listeners to edit and delete buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.getAttribute('data-id');
            openEditModal(itemId, items);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const itemId = btn.getAttribute('data-id');
            deleteItem(itemId);
        });
    });
    
    // Add click event to rows to show details
    document.querySelectorAll('#inventoryTable tr').forEach(row => {
        row.addEventListener('click', () => {
            const itemId = row.querySelector('.edit-btn').getAttribute('data-id');
            const item = items.find(i => i.id === itemId);
            if (item) showItemDetails(item);
        });
    });
    
    hideLoading();
}

// Get store name by ID
function getStoreName(storeId) {
    const store = stores.find(s => s.id === storeId);
    return store ? `${store.name} (${store.location})` : storeId;
}

// Fuzzy match for product names
function fuzzyMatch(str, pattern) {
    pattern = pattern.toLowerCase().split('').join('.*');
    const regex = new RegExp(`.*${pattern}.*`);
    return regex.test(str.toLowerCase());
}

// Open edit modal for an item
async function openEditModal(itemId, items) {
    showLoading();
    try {
        // If items array not provided, fetch the specific item
        let item;
        if (items) {
            item = items.find(i => i.id === itemId);
        }
        
        if (!item) {
            const doc = await db.collection('users').doc(currentUser.uid)
                .collection('inventory').doc(itemId).get();
            if (!doc.exists) {
                throw new Error('Item not found');
            }
            item = doc.data();
            item.id = doc.id;
        }
        
        currentEditItem = item;
        
        // Create form HTML
        editItemForm.innerHTML = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="editProductName" class="form-label">Product Name</label>
                    <input type="text" class="form-control" id="editProductName" value="${escapeHtml(item['Product Name'] || '')}">
                </div>
                <div class="col-md-6">
                    <label for="editBrand" class="form-label">Brand</label>
                    <input type="text" class="form-control" id="editBrand" value="${escapeHtml(item.Brand || '')}">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-4">
                    <label for="editColor" class="form-label">Color</label>
                    <input type="text" class="form-control" id="editColor" value="${escapeHtml(item.Color || '')}">
                </div>
                <div class="col-md-4">
                    <label for="editSize" class="form-label">Size</label>
                    <input type="text" class="form-control" id="editSize" value="${escapeHtml(item.Size || '')}">
                </div>
                <div class="col-md-4">
                    <label for="editGender" class="form-label">Gender</label>
                    <input type="text" class="form-control" id="editGender" value="${escapeHtml(item.Gender || '')}">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-4">
                    <label for="editPrice" class="form-label">Price</label>
                    <input type="text" class="form-control" id="editPrice" value="${escapeHtml(item.Price || '')}">
                </div>
                <div class="col-md-4">
                    <label for="editQuantity" class="form-label">Quantity</label>
                    <input type="text" class="form-control" id="editQuantity" value="${escapeHtml(item.Quantity || '')}">
                </div>
                <div class="col-md-4">
                    <label for="editAtNo" class="form-label">AT No</label>
                    <input type="text" class="form-control" id="editAtNo" value="${escapeHtml(item.AtNo || '')}">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6">
                    <label for="editMaterial" class="form-label">Material</label>
                    <input type="text" class="form-control" id="editMaterial" value="${escapeHtml(item.Material || '')}">
                </div>
                <div class="col-md-6">
                    <label for="editStyle" class="form-label">Style</label>
                    <input type="text" class="form-control" id="editStyle" value="${escapeHtml(item.Style || '')}">
                </div>
            </div>
            <div class="mb-3">
                <label for="editNotes" class="form-label">Notes</label>
                <textarea class="form-control" id="editNotes" rows="3">${escapeHtml(item.notes || '')}</textarea>
            </div>
            <input type="hidden" id="editItemId" value="${escapeHtml(item.id)}">
        `;
        
        editItemModal.show();
        hideLoading();
    } catch (error) {
        console.error('Error opening edit modal:', error);
        alert('Failed to load item for editing');
        hideLoading();
    }
}

// Save changes to an item
async function saveItemChanges() {
    const itemId = document.getElementById('editItemId').value;
    if (!itemId) return;
    
    const updates = {
        'Product Name': document.getElementById('editProductName').value,
        Brand: document.getElementById('editBrand').value,
        Color: document.getElementById('editColor').value,
        Size: document.getElementById('editSize').value,
        Gender: document.getElementById('editGender').value,
        Price: document.getElementById('editPrice').value,
        Quantity: document.getElementById('editQuantity').value,
        AtNo: document.getElementById('editAtNo').value,
        Material: document.getElementById('editMaterial').value,
        Style: document.getElementById('editStyle').value,
        notes: document.getElementById('editNotes').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    showLoading();
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('inventory').doc(itemId)
            .update(updates);
        
        editItemModal.hide();
        hideLoading();
        alert('Item updated successfully');
    } catch (error) {
        console.error('Error updating item:', error);
        alert('Failed to update item');
        hideLoading();
    }
}

// Delete an item
async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    showLoading();
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('inventory').doc(itemId)
            .delete();
        
        alert('Item deleted successfully');
    } catch (error) {
        console.error('Error deleting item:', error);
        alert('Failed to delete item');
    } finally {
        hideLoading();
    }
}

// Show item details
function showItemDetails(item) {
    if (!item) return;
    
    let details = `
        <h5>${escapeHtml(item['Product Name'] || 'N/A')}</h5>
        <p><strong>Brand:</strong> ${escapeHtml(item.Brand || 'N/A')}</p>
        <p><strong>Color:</strong> ${escapeHtml(item.Color || 'N/A')}</p>
        <p><strong>Size:</strong> ${escapeHtml(item.Size || 'N/A')}</p>
        <p><strong>Price:</strong> ${escapeHtml(item.Price || '0')}</p>
        <p><strong>Quantity:</strong> ${escapeHtml(item.Quantity || '0')}</p>
        <p><strong>Store:</strong> ${escapeHtml(getStoreName(item.storeId))}</p>
        <p><strong>AT No:</strong> ${escapeHtml(item.AtNo || 'N/A')}</p>
        <p><strong>Gender:</strong> ${escapeHtml(item.Gender || 'N/A')}</p>
        <p><strong>Material:</strong> ${escapeHtml(item.Material || 'N/A')}</p>
        <p><strong>Style:</strong> ${escapeHtml(item.Style || 'N/A')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(item.notes || 'N/A')}</p>
    `;
    
    // Create a modal to show details
    const detailModal = new bootstrap.Modal(document.createElement('div'));
    detailModal._element.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Item Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    ${details}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(detailModal._element);
    detailModal.show();
    
    // Clean up when modal is hidden
    detailModal._element.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(detailModal._element);
    });
}

// Simple HTML escaping function
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Show loading spinner
function showLoading() {
    loadingSpinner.classList.remove('d-none');
}

// Hide loading spinner
function hideLoading() {
    loadingSpinner.classList.add('d-none');
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Show login modal immediately
    loginModal.show();
    initApp();
});
