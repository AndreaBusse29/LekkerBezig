let deferredPrompt;
const installBtn = document.getElementById('installBtn');
const statusEl = document.getElementById('status');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
        updateStatus('Service Worker registered');
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
        updateStatus('Service Worker failed');
      });
  });
} else {
  updateStatus('Service Worker not supported');
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'inline-block';
});

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    deferredPrompt = null;
    installBtn.style.display = 'none';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  updateStatus('App installed');
  installBtn.style.display = 'none';
});

function updateStatus(message) {
  statusEl.textContent = message;
}

document.addEventListener('DOMContentLoaded', async () => {
  updateStatus('Ready');
  
  if (window.matchMedia('(display-mode: standalone)').matches) {
    updateStatus('Running as PWA');
  } else if (window.navigator.standalone === true) {
    updateStatus('Running as PWA (iOS)');
  }

  // Handle authentication flow
  let isAuthenticated = false;
  
  // Check for auth from URL params (after OAuth callback)
  if (checkAuthFromURL()) {
    isAuthenticated = true;
  } 
  // Check for stored authentication
  else if (loadStoredAuth()) {
    // Verify stored token is still valid
    isAuthenticated = await verifyAuthentication();
  }
  
  // Setup UI based on authentication state
  setupAuthUI();
  
  // Initialize app if authenticated
  if (isAuthenticated) {
    initializeSnackMenu();
    initializeCountdown();
    await loadSelectionFromBackend();
    await initializeNotifications();
  }
});

let selectedItems = new Set();
let userId = generateUserId();
let currentUser = null;
let authToken = null;

// Backend API configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : '/api';

const AUTH_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/auth'
  : '/auth';

function generateUserId() {
  let stored = localStorage.getItem('lekker-bezig-user-id');
  if (!stored) {
    stored = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('lekker-bezig-user-id', stored);
  }
  return stored;
}

// Authentication functions
function checkAuthFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const userStr = urlParams.get('user');
  const error = urlParams.get('error');
  
  if (error === 'auth_failed') {
    showAuthError('Authentication failed. Please make sure you\'re using a the-experts.nl account.');
    return false;
  }
  
  if (token && userStr) {
    try {
      authToken = token;
      currentUser = JSON.parse(decodeURIComponent(userStr));
      localStorage.setItem('auth-token', token);
      localStorage.setItem('current-user', JSON.stringify(currentUser));
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return true;
    } catch (error) {
      console.error('Error parsing auth data:', error);
      return false;
    }
  }
  
  return false;
}

function loadStoredAuth() {
  const storedToken = localStorage.getItem('auth-token');
  const storedUser = localStorage.getItem('current-user');
  
  if (storedToken && storedUser) {
    try {
      authToken = storedToken;
      currentUser = JSON.parse(storedUser);
      return true;
    } catch (error) {
      console.error('Error loading stored auth:', error);
      localStorage.removeItem('auth-token');
      localStorage.removeItem('current-user');
      return false;
    }
  }
  
  return false;
}

async function verifyAuthentication() {
  if (!authToken) return false;
  
  try {
    const response = await fetch(`${AUTH_BASE_URL}/user`, {
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      currentUser = userData;
      localStorage.setItem('current-user', JSON.stringify(currentUser));
      return true;
    } else {
      // Token is invalid, clear it
      clearAuth();
      return false;
    }
  } catch (error) {
    console.error('Error verifying authentication:', error);
    return false;
  }
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('auth-token');
  localStorage.removeItem('current-user');
}

function showAuthError(message) {
  const errorDiv = document.getElementById('authError');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function setupAuthUI() {
  const loginSection = document.getElementById('loginSection');
  const userInfoBar = document.getElementById('userInfoBar');
  const mainContent = document.getElementById('mainContent');
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userName = document.getElementById('userName');
  
  if (currentUser && authToken) {
    // User is authenticated
    loginSection.style.display = 'none';
    userInfoBar.style.display = 'flex';
    mainContent.style.display = 'block';
    
    // Update user info
    userName.textContent = currentUser.name || currentUser.email;
    
    // Update userId to use authenticated user's ID
    userId = currentUser.id;
    
  } else {
    // User is not authenticated
    loginSection.style.display = 'flex';
    userInfoBar.style.display = 'none';
    mainContent.style.display = 'none';
  }
  
  // Event listeners
  googleLoginBtn.addEventListener('click', () => {
    window.location.href = `${AUTH_BASE_URL}/google`;
  });
  
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch(`${AUTH_BASE_URL}/logout`, {
        method: 'GET',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      setupAuthUI();
    }
  });
}

async function saveSelectionToBackend() {
  if (!authToken || !currentUser) {
    console.error('Not authenticated');
    return;
  }
  
  try {
    const selectionData = {
      userId: userId,
      userName: currentUser.name,
      selections: Array.from(selectedItems),
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${API_BASE_URL}/selections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include',
      body: JSON.stringify(selectionData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Selection saved:', result);
      updateStatus('Selection saved');
    } else if (response.status === 401) {
      clearAuth();
      setupAuthUI();
    } else {
      console.error('Failed to save selection:', response.statusText);
      updateStatus('Failed to save selection');
    }
  } catch (error) {
    console.error('Error saving selection:', error);
    updateStatus('Error saving selection');
  }
}

async function loadSelectionFromBackend() {
  if (!authToken || !currentUser) {
    console.log('Not authenticated, skipping selection load');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/selections/${userId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const userData = await response.json();
      selectedItems = new Set(userData.selections || []);
      updateAllMenuIcons();
      console.log('Selection loaded:', userData);
      updateStatus('Selection loaded');
    } else if (response.status === 404) {
      console.log('No existing selection found');
    } else if (response.status === 401) {
      clearAuth();
      setupAuthUI();
    } else {
      console.error('Failed to load selection:', response.statusText);
    }
  } catch (error) {
    console.error('Error loading selection:', error);
  }
}

function initializeSnackMenu() {
  const categoryButtons = document.querySelectorAll('.category-btn');
  const menuItems = document.querySelectorAll('.menu-item');
  const backButton = document.querySelector('.back-button');
  
  updateAllMenuIcons();
  
  categoryButtons.forEach(button => {
    button.addEventListener('click', () => {
      const category = button.dataset.category;
      
      categoryButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      filterMenuItems(category);
    });
  });
  
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const itemName = item.querySelector('h3').textContent;
      
      toggleItemSelection(item, itemName);
    });
  });
  
  if (backButton) {
    backButton.addEventListener('click', () => {
      console.log('Back button clicked');
    });
  }
  
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const page = e.currentTarget.dataset.page;
      
      navItems.forEach(navItem => navItem.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      navigateToPage(page);
    });
  });
}

function filterMenuItems(category) {
  const menuItems = document.querySelectorAll('.menu-item');
  
  menuItems.forEach(item => {
    const itemCategory = item.dataset.category;
    if (category === 'all') {
      item.style.display = 'flex';
    } else if (category === itemCategory) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function toggleItemSelection(menuItem, itemName) {
  const itemId = itemName.toLowerCase().replace(/\s+/g, '-');
  
  if (selectedItems.has(itemId)) {
    selectedItems.delete(itemId);
    console.log(`Removed: ${itemName}`);
  } else {
    selectedItems.clear();
    selectedItems.add(itemId);
    console.log(`Added: ${itemName}`);
  }
  
  updateAllMenuIcons();
  saveSelectionToBackend();
}

function updateMenuItemIcon(menuItem, isSelected) {
  const iconContainer = menuItem.querySelector('.item-icon');
  const icon = iconContainer.querySelector('svg');
  if (icon && iconContainer) {
    if (isSelected) {
        icon.innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/>';
        iconContainer.style.backgroundColor = 'green';
        iconContainer.style.border = '2px solid green';
        iconContainer.style.borderRadius = '4px';
        iconContainer.style.width = '32px';
        iconContainer.style.height = '32px';
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
    } else {
        icon.innerHTML = '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="black"/>';
        iconContainer.style.backgroundColor = 'transparent';
        iconContainer.style.border = '2px solid black';
        iconContainer.style.borderRadius = '4px';
        iconContainer.style.width = '32px';
        iconContainer.style.height = '32px';
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
    }
  }
}

function updateAllMenuIcons() {
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    const itemName = item.querySelector('h3').textContent;
    const itemId = itemName.toLowerCase().replace(/\s+/g, '-');
    const isSelected = selectedItems.has(itemId);
    updateMenuItemIcon(item, isSelected);
  });
}

function getNextFridayNoon() {
  const now = new Date();
  const nextFriday = new Date(now);
  
  // Find next Friday
  const daysUntilFriday = (5 + 7 - now.getDay()) % 7 || 7;
  nextFriday.setDate(now.getDate() + daysUntilFriday);
  
  // Set to noon
  nextFriday.setHours(12, 0, 0, 0);
  
  // If it's already Friday and past noon, go to next Friday
  if (now.getDay() === 5 && now.getHours() >= 12) {
    nextFriday.setDate(nextFriday.getDate() + 7);
  }
  
  return nextFriday;
}

function updateCountdown() {
  const now = new Date();
  const nextFriday = getNextFridayNoon();
  const timeDiff = nextFriday.getTime() - now.getTime();
  
  if (timeDiff <= 0) {
    document.getElementById('days').textContent = '0';
    document.getElementById('hours').textContent = '0';
    document.getElementById('minutes').textContent = '0';
    return;
  }
  
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  document.getElementById('days').textContent = days.toString();
  document.getElementById('hours').textContent = hours.toString();
  document.getElementById('minutes').textContent = minutes.toString();
}

function initializeCountdown() {
  updateCountdown();
  setInterval(updateCountdown, 60000); // Update every minute
}

// Navigation functionality
function navigateToPage(page) {
  const mainContent = document.getElementById('mainContent');
  const adminSection = document.getElementById('adminSection');
  
  // Hide all sections first
  mainContent.style.display = 'none';
  adminSection.style.display = 'none';
  
  switch(page) {
    case 'home':
      mainContent.style.display = 'block';
      break;
    case 'admin':
      adminSection.style.display = 'block';
      loadAdminOrderData();
      break;
    default:
      mainContent.style.display = 'block';
  }
  
  console.log(`Navigate to: ${page}`);
}

// Admin functionality
async function loadAdminOrderData() {
  const adminOrderList = document.getElementById('adminOrderList');
  
  if (!authToken) {
    adminOrderList.innerHTML = '<p class="error">Authentication required</p>';
    return;
  }
  
  try {
    adminOrderList.innerHTML = '<p>Bestellingen worden geladen...</p>';
    
    const response = await fetch(`${API_BASE_URL}/selections`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      displayAdminOrderData(data);
    } else if (response.status === 401) {
      clearAuth();
      setupAuthUI();
    } else {
      adminOrderList.innerHTML = '<p class="error">Fout bij laden van bestellingen</p>';
    }
  } catch (error) {
    console.error('Error loading admin order data:', error);
    adminOrderList.innerHTML = '<p class="error">Fout bij laden van bestellingen</p>';
  }
}

function displayAdminOrderData(data) {
  const adminOrderList = document.getElementById('adminOrderList');
  
  if (!data.selections || data.selections.length === 0) {
    adminOrderList.innerHTML = '<p>Geen bestellingen gevonden</p>';
    // Store empty data and update button state
    window.currentOrderData = { selections: [] };
    updateOrderButtonState(false);
    return;
  }
  
  // Group selections by item type
  const itemCounts = {};
  let totalSelections = 0;
  data.selections.forEach(selection => {
    selection.selections.forEach(item => {
      const itemName = getItemDisplayName(item);
      itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
      totalSelections++;
    });
  });
  
  let html = '<div class="admin-summary">';
  html += '<h4>Overzicht per Snack:</h4>';
  html += '<ul class="item-summary">';
  
  Object.entries(itemCounts).forEach(([itemName, count]) => {
    html += `<li><strong>${itemName}:</strong> ${count}x</li>`;
  });
  
  html += '</ul></div>';
  
  adminOrderList.innerHTML = html;
  
  // Store data for order placement
  window.currentOrderData = data;
  
  // Update button state based on whether there are selections
  updateOrderButtonState(totalSelections > 0);
}

function getItemDisplayName(itemId) {
  const displayNames = {
    'rundvlees-kroket': 'Rundvlees-Kroket',
    'vega-kroket': 'Vega Kroket',
    'frikandel': 'Frikandel'
  };
  return displayNames[itemId] || itemId;
}

function updateOrderButtonState(hasSelections) {
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  if (placeOrderBtn) {
    placeOrderBtn.disabled = !hasSelections;
    
    if (hasSelections) {
      placeOrderBtn.classList.remove('disabled');
      placeOrderBtn.title = '';
    } else {
      placeOrderBtn.classList.add('disabled');
      placeOrderBtn.title = 'Geen bestellingen beschikbaar om te plaatsen';
    }
  }
}

// Initialize admin functionality
document.addEventListener('DOMContentLoaded', () => {
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const orderModal = document.getElementById('orderConfirmationModal');
  const closeModalBtn = document.getElementById('closeOrderModal');
  const cancelOrderBtn = document.getElementById('cancelOrderBtn');
  const confirmOrderBtn = document.getElementById('confirmOrderBtn');
  
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', () => {
      showOrderConfirmation();
    });
  }
  
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      hideOrderConfirmation();
    });
  }
  
  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      hideOrderConfirmation();
    });
  }
  
  if (confirmOrderBtn) {
    confirmOrderBtn.addEventListener('click', () => {
      submitCompleteOrder();
    });
  }
  
  // Close modal when clicking outside
  if (orderModal) {
    orderModal.addEventListener('click', (e) => {
      if (e.target === orderModal) {
        hideOrderConfirmation();
      }
    });
  }
});

function showOrderConfirmation() {
  if (!window.currentOrderData || !window.currentOrderData.selections || window.currentOrderData.selections.length === 0) {
    alert('Geen bestellingen gevonden om te plaatsen.');
    return;
  }
  
  // Check if there are any actual selections
  let hasSelections = false;
  window.currentOrderData.selections.forEach(selection => {
    if (selection.selections && selection.selections.length > 0) {
      hasSelections = true;
    }
  });
  
  if (!hasSelections) {
    alert('Geen bestellingen gevonden om te plaatsen.');
    return;
  }
  
  const modal = document.getElementById('orderConfirmationModal');
  const summaryContent = document.getElementById('orderSummaryContent');
  const totalItems = document.getElementById('totalItems');
  
  // Generate order summary
  const itemCounts = {};
  let totalCount = 0;
  
  window.currentOrderData.selections.forEach(selection => {
    selection.selections.forEach(item => {
      const itemName = getItemDisplayName(item);
      itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
      totalCount++;
    });
  });
  
  let summaryHtml = '<div class="order-confirmation-summary">';
  Object.entries(itemCounts).forEach(([itemName, count]) => {
    summaryHtml += `<div class="order-item"><span>${itemName}</span> <strong>${count}x</strong></div>`;
  });
  summaryHtml += '</div>';
  
  summaryContent.innerHTML = summaryHtml;
  totalItems.textContent = totalCount;
  
  modal.style.display = 'flex';
}

function hideOrderConfirmation() {
  const modal = document.getElementById('orderConfirmationModal');
  modal.style.display = 'none';
}

async function submitCompleteOrder() {
  if (!window.currentOrderData || !authToken) {
    alert('Fout: Geen bestellingsgegevens beschikbaar');
    return;
  }
  
  const confirmBtn = document.getElementById('confirmOrderBtn');
  const originalText = confirmBtn.textContent;
  confirmBtn.textContent = 'Versturen...';
  confirmBtn.disabled = true;
  
  try {
    // Prepare order data for email
    const itemCounts = {};
    let totalCount = 0;
    
    window.currentOrderData.selections.forEach(selection => {
      selection.selections.forEach(item => {
        const itemName = getItemDisplayName(item);
        itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
        totalCount++;
      });
    });
    
    // Create order summary for email
    const orderSummary = {
      items: itemCounts,
      totalItems: totalCount,
      userDetails: window.currentOrderData.selections,
      timestamp: new Date().toISOString(),
      placedBy: currentUser?.name || 'Admin'
    };
    
    // Send order via email using existing email.js functionality
    await sendOrderEmail(orderSummary);
    
    hideOrderConfirmation();
    alert('Bestelling succesvol verstuurd!');
    
    // Reload admin data to reflect any changes
    loadAdminOrderData();
    
  } catch (error) {
    console.error('Error submitting order:', error);
    alert('Fout bij versturen van bestelling: ' + error.message);
  } finally {
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;
  }
}

async function sendOrderEmail(orderSummary) {
  // Fetch EmailJS config from server
  let emailConfig;
  try {
    const response = await fetch(`${API_BASE_URL}/emailjs-config`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch email configuration');
    }
    
    emailConfig = await response.json();
  } catch (error) {
    console.error('Error fetching email config:', error);
    throw new Error('Email configuration not available');
  }
  
  // Format order items for email template
  const orderItems = [];
  Object.entries(orderSummary.items).forEach(([itemName, count]) => {
    orderItems.push({
      name: itemName,
      units: count
    });
  });
  
  const emailData = {
    emailTo: emailConfig.emailTo,
    fromName: emailConfig.emailFrom || 'Admin',
    date: new Date().toLocaleDateString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }),
    orders: orderItems,
    nameOfExpert: orderSummary.placedBy,
    totalItems: orderSummary.totalItems,
    orderDetails: formatOrderForEmail(orderSummary)
  };
  
  // Using EmailJS to send the email
  return emailjs.send(
    emailConfig.serviceId,
    emailConfig.templateId,
    emailData,
    emailConfig.publicKey
  );
}

function formatOrderForEmail(orderSummary) {
  let message = `Nieuwe snack bestelling geplaatst door ${orderSummary.placedBy}\n\n`;
  message += `Datum: ${new Date(orderSummary.timestamp).toLocaleDateString('nl-NL')}\n\n`;
  
  message += `OVERZICHT PER ITEM:\n`;
  Object.entries(orderSummary.items).forEach(([item, count]) => {
    message += `- ${item}: ${count}x\n`;
  });
  
  message += `\nTOTAAL AANTAL ITEMS: ${orderSummary.totalItems}\n\n`;
  
  message += `INDIVIDUELE BESTELLINGEN:\n`;
  orderSummary.userDetails.forEach((user, index) => {
    const items = user.selections.map(item => getItemDisplayName(item)).join(', ');
    message += `${index + 1}. ${user.userName}: ${items}\n`;
  });
  
  message += `\n---\nGeplaatst via Lekker Bezig PWA`;
  
  return message;
}

// Notification functionality
let vapidPublicKey = null;

async function initializeNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }

  try {
    // Get VAPID public key from server
    const response = await fetch(`${API_BASE_URL}/notifications/vapid-key`);
    const data = await response.json();
    vapidPublicKey = data.publicKey;
    
    // Check current notification status
    await checkNotificationStatus();
    
    // Show notification memo if user hasn't seen it yet and notifications not enabled
    const memoShown = localStorage.getItem('notification-memo-shown');
    if (!memoShown) {
      const status = await getNotificationStatus();
      if (!status.enabled) {
        showNotificationMemo();
      }
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function subscribeToPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    // Send subscription to server
    const response = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include',
      body: JSON.stringify({ subscription })
    });

    if (response.ok) {
      console.log('Successfully subscribed to push notifications');
      return true;
    } else {
      console.error('Failed to save subscription to server');
      return false;
    }
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return false;
  }
}

async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
    }

    // Remove subscription from server
    const response = await fetch(`${API_BASE_URL}/notifications/unsubscribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });

    if (response.ok) {
      console.log('Successfully unsubscribed from push notifications');
      return true;
    } else {
      console.error('Failed to remove subscription from server');
      return false;
    }
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
}

async function getNotificationStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/notifications/status`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error getting notification status:', error);
  }
  
  return { enabled: false, hasSubscription: false };
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function showNotificationMemo() {
  const memo = document.getElementById('notificationMemo');
  if (memo) {
    memo.style.display = 'block';
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      hideNotificationMemo();
    }, 10000);
  }
}

function hideNotificationMemo() {
  const memo = document.getElementById('notificationMemo');
  if (memo) {
    memo.style.display = 'none';
    localStorage.setItem('notification-memo-shown', 'true');
  }
}

async function checkNotificationStatus() {
  const status = await getNotificationStatus();
  console.log('Notification status:', status);
}

// Initialize notification settings modal
document.addEventListener('DOMContentLoaded', () => {
  const notificationSettingsBtn = document.getElementById('notificationSettingsBtn');
  const notificationModal = document.getElementById('notificationSettingsModal');
  const closeNotificationModalBtn = document.getElementById('closeNotificationModal');
  const notificationToggle = document.getElementById('notificationToggle');
  const saveNotificationSettingsBtn = document.getElementById('saveNotificationSettings');
  const enableNotificationsBtn = document.getElementById('enableNotificationsBtn');
  const dismissMemoBtn = document.getElementById('dismissMemoBtn');

  if (notificationSettingsBtn) {
    notificationSettingsBtn.addEventListener('click', async () => {
      await showNotificationSettings();
    });
  }

  if (closeNotificationModalBtn) {
    closeNotificationModalBtn.addEventListener('click', () => {
      hideNotificationSettings();
    });
  }

  if (saveNotificationSettingsBtn) {
    saveNotificationSettingsBtn.addEventListener('click', async () => {
      await saveNotificationSettings();
    });
  }

  if (enableNotificationsBtn) {
    enableNotificationsBtn.addEventListener('click', async () => {
      await enableNotifications();
      hideNotificationMemo();
    });
  }

  if (dismissMemoBtn) {
    dismissMemoBtn.addEventListener('click', () => {
      hideNotificationMemo();
    });
  }

  // Close modal when clicking outside
  if (notificationModal) {
    notificationModal.addEventListener('click', (e) => {
      if (e.target === notificationModal) {
        hideNotificationSettings();
      }
    });
  }
});

async function showNotificationSettings() {
  const modal = document.getElementById('notificationSettingsModal');
  const toggle = document.getElementById('notificationToggle');
  const statusText = document.getElementById('notificationStatusText');
  
  // Load current settings
  const status = await getNotificationStatus();
  toggle.checked = status.enabled;
  
  if (status.enabled) {
    statusText.textContent = '✅ Notificaties zijn ingeschakeld';
    statusText.className = 'notification-status enabled';
  } else {
    statusText.textContent = '❌ Notificaties zijn uitgeschakeld';
    statusText.className = 'notification-status disabled';
  }
  
  modal.style.display = 'flex';
}

function hideNotificationSettings() {
  const modal = document.getElementById('notificationSettingsModal');
  modal.style.display = 'none';
}

async function saveNotificationSettings() {
  const toggle = document.getElementById('notificationToggle');
  const saveBtn = document.getElementById('saveNotificationSettings');
  const statusText = document.getElementById('notificationStatusText');
  
  saveBtn.textContent = 'Opslaan...';
  saveBtn.disabled = true;
  
  try {
    if (toggle.checked) {
      // Enable notifications
      const success = await enableNotifications();
      if (success) {
        statusText.textContent = '✅ Notificaties zijn ingeschakeld';
        statusText.className = 'notification-status enabled';
      } else {
        toggle.checked = false;
        statusText.textContent = '❌ Kon notificaties niet inschakelen';
        statusText.className = 'notification-status error';
      }
    } else {
      // Disable notifications
      const success = await unsubscribeFromPushNotifications();
      if (success) {
        statusText.textContent = '❌ Notificaties zijn uitgeschakeld';
        statusText.className = 'notification-status disabled';
      }
    }
    
    setTimeout(() => {
      hideNotificationSettings();
    }, 1000);
    
  } catch (error) {
    console.error('Error saving notification settings:', error);
    statusText.textContent = '❌ Fout bij opslaan instellingen';
    statusText.className = 'notification-status error';
  } finally {
    saveBtn.textContent = 'Opslaan';
    saveBtn.disabled = false;
  }
}

async function enableNotifications() {
  try {
    // Request permission
    const hasPermission = await requestNotificationPermission();
    
    if (!hasPermission) {
      alert('Notificatie toestemming is vereist om herinneringen te ontvangen.');
      return false;
    }
    
    // Subscribe to push notifications
    const success = await subscribeToPushNotifications();
    
    if (success) {
      console.log('Notifications enabled successfully');
      return true;
    } else {
      alert('Kon notificaties niet inschakelen. Probeer het opnieuw.');
      return false;
    }
  } catch (error) {
    console.error('Error enabling notifications:', error);
    alert('Er is een fout opgetreden bij het inschakelen van notificaties.');
    return false;
  }
}