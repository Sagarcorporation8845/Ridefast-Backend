// packages/ride-service/utils/geo.js
const getHaversineDistance = (coords1, coords2) => {
    const toRad = (x) => x * Math.PI / 180;
    const R = 6371; // Earth's radius in km

    const dLat = toRad(parseFloat(coords2.latitude) - parseFloat(coords1.latitude));
    const dLon = toRad(parseFloat(coords2.longitude) - parseFloat(coords1.longitude));
    const lat1 = toRad(parseFloat(coords1.latitude));
    const lat2 = toRad(parseFloat(coords2.latitude));

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

module.exports = {
    getHaversineDistance,
};