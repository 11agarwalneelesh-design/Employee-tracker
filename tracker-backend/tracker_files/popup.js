document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('emailInput');
    const saveBtn = document.getElementById('saveBtn');
    const profileStatus = document.getElementById('profileStatus');

    // Display the currently running profile configuration name
    chrome.storage.local.get(["cachedEmployeeId"], (data) => {
        if (data && data.cachedEmployeeId) {
            emailInput.value = data.cachedEmployeeId === "Unknown_Employee" ? "" : data.cachedEmployeeId;
            profileStatus.textContent = `Active ID: ${data.cachedEmployeeId}`;
        }
    });

    // Commit manual corporate mail changes securely
    saveBtn.addEventListener('click', () => {
        const inputVal = emailInput.value.trim();
        if (inputVal && inputVal.includes('@')) {
            chrome.storage.local.set({ cachedEmployeeId: inputVal }, () => {
                profileStatus.textContent = `Active ID: ${inputVal}`;
                alert("Profile configuration saved successfully! Restarting tracking loops.");
            });
        } else {
            alert("Please provide a valid corporate email structure.");
        }
    });
});