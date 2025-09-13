// utils/role-utils.js
// Utility functions for role-based access control

/**
 * Check if the role is a city-level role (city_admin or support/support_agent)
 * @param {string} role - The user's role
 * @returns {boolean} - True if the role requires city-based filtering
 */
function isCityRole(role) {
  return role === 'city_admin' || role === 'support' || role === 'support_agent';
}

/**
 * Check if the role is a city admin
 * @param {string} role - The user's role
 * @returns {boolean} - True if the role is city_admin
 */
function isCityAdmin(role) {
  return role === 'city_admin';
}

/**
 * Check if the role is support staff (support or support_agent)
 * @param {string} role - The user's role
 * @returns {boolean} - True if the role is support staff
 */
function isSupportStaff(role) {
  return role === 'support' || role === 'support_agent';
}

/**
 * Check if the role is central admin
 * @param {string} role - The user's role
 * @returns {boolean} - True if the role is central_admin
 */
function isCentralAdmin(role) {
  return role === 'central_admin';
}

/**
 * Get the normalized role name (convert support_agent to support for consistency)
 * @param {string} role - The user's role
 * @returns {string} - Normalized role name
 */
function normalizeRole(role) {
  if (role === 'support_agent') {
    return 'support';
  }
  return role;
}

/**
 * Check if user has permission for city admin operations
 * @param {string} role - The user's role
 * @returns {boolean} - True if user can perform city admin operations
 */
function canPerformCityAdminOperations(role) {
  return isCityAdmin(role);
}

/**
 * Check if user has permission for support operations
 * @param {string} role - The user's role
 * @returns {boolean} - True if user can perform support operations
 */
function canPerformSupportOperations(role) {
  return isCityAdmin(role) || isSupportStaff(role);
}

module.exports = {
  isCityRole,
  isCityAdmin,
  isSupportStaff,
  isCentralAdmin,
  normalizeRole,
  canPerformCityAdminOperations,
  canPerformSupportOperations
};