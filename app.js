// ============================================================
// CONFIG — fill this in after deploying Api.gs.txt's doPost() as part of
// the Apps Script web app (Deploy > Manage deployments > copy the /exec URL).
// ============================================================
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbysjczGw2hPim2ah9M82PqoHPSjOiHeZb7GyQtkYH6UKoqiXCKho0nBeFmmaJj6Z5QDbg/exec';

// ============================================================
// State
// ============================================================
let token = localStorage.getItem('attendance_token');
let employee = JSON.parse(localStorage.getItem('attendance_employee') || 'null');

let currentPosition = null;
let employeeData = [];
let allEmployees = [];
let serverToday = null;

// ============================================================
// API helper — POST with text/plain body to avoid a CORS preflight
// (Apps Script's doPost doesn't answer OPTIONS requests).
// ============================================================
async function apiCall(action, payload) {
  const res = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action }, payload)),
  });
  if (!res.ok) {
    throw new Error('Request failed (' + res.status + ')');
  }
  return res.json();
}

// ============================================================
// Auth — login / logout / session gating
// ============================================================
function showLogin() {
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('formContainer').style.display = 'none';
  document.getElementById('appHeader').style.display = 'none';
}

function showForm() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('formContainer').style.display = 'block';
  document.getElementById('appHeader').style.display = 'flex';
  document.getElementById('whoAmI').textContent = employee ? `Logged in as ${employee.fullName}` : '';
}

function logout() {
  token = null;
  employee = null;
  localStorage.removeItem('attendance_token');
  localStorage.removeItem('attendance_employee');
  showLogin();
}

document.getElementById('logoutBtn').addEventListener('click', logout);

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const employeeId = document.getElementById('loginEmployeeId').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const loginBtn = document.getElementById('loginBtn');
  const statusDiv = document.getElementById('loginStatus');

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';
  statusDiv.style.display = 'none';

  try {
    const result = await apiCall('login', { employeeId, pin });
    if (result.success) {
      token = result.token;
      employee = result.employee;
      localStorage.setItem('attendance_token', token);
      localStorage.setItem('attendance_employee', JSON.stringify(employee));
      document.getElementById('loginPin').value = '';
      showForm();
      initAttendanceForm();
    } else {
      statusDiv.className = 'status-message error';
      statusDiv.textContent = result.error || 'Login failed.';
      statusDiv.style.display = 'block';
    }
  } catch (err) {
    statusDiv.className = 'status-message error';
    statusDiv.textContent = 'Could not reach the server: ' + err.message;
    statusDiv.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log In';
  }
});

// ============================================================
// Location — mandatory for submission in the app (unlike the old form,
// which allowed a silent skip). Still requested early so it's usually
// already resolved by the time the user hits Submit.
// ============================================================
function tryGetLocation() {
  if (!navigator.geolocation) {
    console.log('Geolocation not supported by this browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (position) {
      currentPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      document.getElementById('locationNotice').style.display = 'none';
    },
    function (error) {
      console.log('Location unavailable:', error.message);
      document.getElementById('locationNotice').style.display = 'block';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

// ============================================================
// Attendance form — ported from the original app, google.script.run swapped
// for apiCall(), email field removed (server derives it from the session).
// ============================================================
function loadEmployeeData() {
  document.getElementById('loadingNames').style.display = 'block';
  document.getElementById('nameCheckboxes').style.display = 'none';

  apiCall('getEmployeeData', { token })
    .then(function (employees) {
      if (employees && employees.error) throw new Error(employees.error);
      allEmployees = employees;
      employeeData = employees;
      generateCheckboxes(employees);
      document.getElementById('loadingNames').style.display = 'none';
      document.getElementById('nameCheckboxes').style.display = 'grid';
      setupNameCheckboxHandlers();
      setupSearchFunctionality();
      setupAgencyFilter();
    })
    .catch(function (error) {
      showMessage('Error loading employee data: ' + error.message, 'error');
      document.getElementById('loadingNames').innerHTML = 'Error loading employees. Please refresh the page.';
    });
}

function generateCheckboxes(employees) {
  const container = document.getElementById('nameCheckboxes');
  container.innerHTML = '';

  employees.forEach(employee => {
    const checkboxItem = document.createElement('div');
    checkboxItem.className = 'checkbox-item';

    const checkboxId = 'name_' + employee.fullName.replace(/[^a-zA-Z0-9]/g, '');

    checkboxItem.innerHTML = `
        <input type="checkbox" id="${checkboxId}" name="names" value="${employee.fullName}" data-form-name="${employee.formName}" data-agency="${employee.agency}">
        <label for="${checkboxId}" class="checkbox-label">${employee.fullName}</label>
    `;

    container.appendChild(checkboxItem);
  });
}

function setupAgencyFilter() {
  const buttons = document.querySelectorAll('.agency-btn');
  const hiddenInput = document.getElementById('agency');

  buttons.forEach(btn => {
    btn.addEventListener('click', function () {
      buttons.forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      hiddenInput.value = this.dataset.value;
      document.getElementById('agencyError').style.display = 'none';
      filterEmployeesByAgency(this.dataset.value);
    });
  });
}

function filterEmployeesByAgency(selectedAgency) {
  if (!selectedAgency) {
    employeeData = allEmployees;
  } else {
    employeeData = allEmployees.filter(employee => employee.agency === selectedAgency);
  }

  generateCheckboxes(employeeData);
  setupNameCheckboxHandlers();

  const searchInput = document.getElementById('nameSearch');
  searchInput.value = '';
  resetSearchResults();

  if (employeeData.length === 0 && selectedAgency) {
    showEmployeesMessage('No employees found for the selected agency.');
  } else {
    hideEmployeesMessage();
  }
}

function showEmployeesMessage(message) {
  const container = document.getElementById('nameCheckboxes');
  container.innerHTML = `<div class="no-results" style="display: block; grid-column: 1 / -1;">${message}</div>`;
}

function hideEmployeesMessage() {
  const noResultsElement = document.querySelector('#nameCheckboxes .no-results');
  if (noResultsElement) {
    noResultsElement.remove();
  }
}

function resetSearchResults() {
  const checkboxItems = document.querySelectorAll('.checkbox-item');
  const noResults = document.getElementById('noResults');

  checkboxItems.forEach(item => {
    item.classList.remove('hidden');
    item.style.display = 'flex';
  });
  noResults.style.display = 'none';
}

function setDefaultDate() {
  const dateInput = document.getElementById('deploymentDate');

  apiCall('getServerDate', { token })
    .then(function (serverDate) {
      if (serverDate && serverDate.error) throw new Error(serverDate.error);
      serverToday = serverDate;
      dateInput.value = serverDate;

      dateInput.addEventListener('change', function () {
        const existing = document.getElementById('dateWarning');
        if (this.value !== serverToday) {
          if (!existing) {
            const warning = document.createElement('small');
            warning.id = 'dateWarning';
            warning.style.color = '#e67e22';
            warning.style.display = 'block';
            warning.style.marginTop = '5px';
            warning.textContent = '⚠ You changed the date from today. Please make sure this is correct before submitting.';
            dateInput.insertAdjacentElement('afterend', warning);
          }
        } else if (existing) {
          existing.remove();
        }
      });
    })
    .catch(function () {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${year}-${month}-${day}`;
    });
}

function setupPurposeToggle() {
  const buttons = document.querySelectorAll('.purpose-btn:not(.agency-btn)');
  const hiddenInput = document.getElementById('purpose');

  buttons.forEach(btn => {
    btn.addEventListener('click', function () {
      buttons.forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      hiddenInput.value = this.dataset.value;
      document.getElementById('purposeError').style.display = 'none';
    });
  });
}

function setupSiteSearch() {
  const searchInput = document.getElementById('siteSearch');
  const clearBtn = document.getElementById('clearSiteSearch');
  const select = document.getElementById('siteName');
  const allOptions = Array.from(select.options);

  searchInput.addEventListener('input', function () {
    const term = this.value.toLowerCase().trim();
    allOptions.forEach(opt => {
      if (opt.value === '') return;
      opt.hidden = term !== '' && !opt.text.toLowerCase().includes(term);
    });
    const visible = allOptions.filter(o => o.value !== '' && !o.hidden);
    if (visible.length === 1) {
      select.value = visible[0].value;
      searchInput.value = visible[0].text;
    }
  });

  select.addEventListener('change', function () {
    searchInput.value = this.value ? this.options[this.selectedIndex].text : '';
  });

  clearBtn.addEventListener('click', function () {
    searchInput.value = '';
    allOptions.forEach(opt => (opt.hidden = false));
    select.value = '';
  });
}

function setupNameCheckboxHandlers() {
  document.getElementById('clearAllNames').addEventListener('click', function () {
    document.querySelectorAll('input[name="names"]').forEach(cb => (cb.checked = false));
  });

  document.querySelectorAll('input[name="names"]').forEach(checkbox => {
    checkbox.addEventListener('change', hideNameError);
  });
}

function setupSearchFunctionality() {
  const searchInput = document.getElementById('nameSearch');
  const noResults = document.getElementById('noResults');

  searchInput.addEventListener('input', function () {
    const searchTerm = this.value.toLowerCase().trim();
    const checkboxItems = document.querySelectorAll('.checkbox-item');
    let visibleCount = 0;

    checkboxItems.forEach(item => {
      const label = item.querySelector('.checkbox-label');
      const name = label.textContent.toLowerCase();

      if (searchTerm === '' || name.includes(searchTerm)) {
        item.classList.remove('hidden');
        item.style.display = 'flex';
        visibleCount++;
      } else {
        item.classList.add('hidden');
        item.style.display = 'none';
      }
    });

    noResults.style.display = visibleCount === 0 && searchTerm !== '' ? 'block' : 'none';
  });

  document.getElementById('clearAllNames').addEventListener('click', function () {
    searchInput.value = '';
    resetSearchResults();
  });
}

function hideNameError() {
  document.getElementById('nameError').style.display = 'none';
}

function validateNames() {
  const checkboxes = document.querySelectorAll('input[name="names"]:checked');
  if (checkboxes.length === 0) {
    document.getElementById('nameError').style.display = 'block';
    return false;
  }
  return true;
}

function validatePurpose() {
  if (!document.getElementById('purpose').value) {
    document.getElementById('purposeError').style.display = 'block';
    return false;
  }
  return true;
}

function validateAgency() {
  if (!document.getElementById('agency').value) {
    document.getElementById('agencyError').style.display = 'block';
    return false;
  }
  return true;
}

function getSelectedNames() {
  const checkboxes = document.querySelectorAll('input[name="names"]:checked');
  return Array.from(checkboxes).map(cb => cb.dataset.formName).join(', ');
}

function showMessage(message, type) {
  const statusDiv = document.getElementById('statusMessage');
  statusDiv.className = 'status-message ' + type;
  statusDiv.innerHTML = type === 'loading' ? '<div class="spinner"></div>' + message : message;
  statusDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
}

function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initAttendanceForm() {
  tryGetLocation();
  loadEmployeeData();
  setDefaultDate();
  setupSiteSearch();
  setupPurposeToggle();
}

document.getElementById('attendanceForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const namesOk = validateNames();
  const purposeOk = validatePurpose();
  const agencyOk = validateAgency();

  if (!namesOk || !purposeOk || !agencyOk) {
    if (!namesOk) showMessage('Please select at least one name.', 'error');
    else if (!purposeOk) showMessage('Please select a purpose (Time In / Time Out).', 'error');
    else showMessage('Please select an agency.', 'error');
    return;
  }

  // Location is mandatory in the app — re-attempt once right before blocking,
  // in case the user just granted permission after seeing the notice.
  if (!currentPosition) {
    showMessage('Getting your location...', 'loading');
    await new Promise(resolve => {
      if (!navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        pos => {
          currentPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }
  if (!currentPosition) {
    document.getElementById('locationNotice').style.display = 'block';
    showMessage('Location access is required to submit. Please allow location and try again.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  showMessage('Processing your submission...', 'loading');

  try {
    const formData = new FormData(this);
    const imageFile = formData.get('attendanceImage');

    if (!imageFile || imageFile.size === 0) {
      throw new Error('Please upload an image file.');
    }

    showMessage('Processing image...', 'loading');
    const imageBase64 = await convertFileToBase64(imageFile);

    const selectedNames = getSelectedNames();

    const submissionData = {
      deploymentDate: formData.get('deploymentDate'),
      siteName: formData.get('siteName'),
      names: selectedNames,
      agency: formData.get('agency'),
      purpose: formData.get('purpose'),
      remarks: formData.get('remarks'),
      imageData: imageBase64,
      imageName: imageFile.name,
      imageType: imageFile.type,
      location: currentPosition,
    };

    showMessage('Saving attendance record...', 'loading');

    const result = await apiCall('submitAttendance', { token, data: submissionData });

    if (!result.success) {
      throw new Error(result.error || 'Submission failed.');
    }

    showMessage('Attendance submitted successfully!', 'success');
    document.getElementById('attendanceForm').reset();

    const dateWarning = document.getElementById('dateWarning');
    if (dateWarning) dateWarning.remove();

    if (serverToday) {
      document.getElementById('deploymentDate').value = serverToday;
    } else {
      setDefaultDate();
    }

    document.getElementById('siteSearch').value = '';
    document.querySelectorAll('#siteName option').forEach(opt => (opt.hidden = false));
    document.querySelectorAll('.purpose-btn:not(.agency-btn)').forEach(b => b.classList.remove('selected'));
    document.getElementById('purpose').value = '';

    document.querySelectorAll('.agency-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('agency').value = '';

    document.getElementById('nameSearch').value = '';
    employeeData = allEmployees;
    generateCheckboxes(employeeData);
    setupNameCheckboxHandlers();
    resetSearchResults();
    hideEmployeesMessage();

    tryGetLocation();

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Attendance';
  } catch (error) {
    showMessage('Error: ' + error.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Attendance';
  }
});

// ============================================================
// Init
// ============================================================
if (token && employee) {
  showForm();
  initAttendanceForm();
} else {
  showLogin();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
  });
}
