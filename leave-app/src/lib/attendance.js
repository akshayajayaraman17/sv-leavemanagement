import { checkIn, checkOut, fetchPunches, addPunch } from './api'
import { todayStr } from './dates'

// Browser geolocation → { lat, lng }, rejecting with a human-readable message.
export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation is not supported by your browser')); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      e => reject(new Error(e.code === 1 ? 'Location permission denied' : 'Could not get location')),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  })
}

export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
    const j = await res.json()
    const a = j.address || {}
    const parts = [a.road, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.county].filter(Boolean)
    return parts.length ? parts.join(', ') : j.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch { return `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
}

export function calcHoursFromPunches(punches) {
  let total = 0
  for (let i = 0; i < punches.length; i++) {
    if (punches[i].punch_type === 'check_in') {
      const out = punches.find((p, j) => j > i && p.punch_type === 'check_out')
      if (out) total += (new Date(out.punch_time) - new Date(punches[i].punch_time)) / 3600000
    }
  }
  return Math.round(total * 100) / 100
}

// GPS check-in: locate → upsert today's attendance row → log the punch.
// `record` is today's existing attendance row (or null). Returns { data } or { error }.
export async function punchIn(employee, record) {
  const { lat, lng } = await getLocation()
  const address = await reverseGeocode(lat, lng)
  const now = new Date().toISOString()
  const { data, error } = await checkIn({
    employee_id: employee.id, date: todayStr(), check_in_time: now,
    check_in_lat: lat, check_in_lng: lng, check_in_address: address,
    check_out_time: null, check_out_lat: null, check_out_lng: null, check_out_address: null,
    total_hours: record?.total_hours || 0, status: 'present',
  })
  if (error) return { error }
  await addPunch({ attendance_id: data.id, employee_id: employee.id, punch_type: 'check_in', punch_time: now, lat, lng, address })
  return { data }
}

// GPS check-out: locate → log the punch → recompute hours → close the row.
export async function punchOut(employee, record) {
  const { lat, lng } = await getLocation()
  const address = await reverseGeocode(lat, lng)
  const now = new Date().toISOString()
  await addPunch({ attendance_id: record.id, employee_id: employee.id, punch_type: 'check_out', punch_time: now, lat, lng, address })
  const { data: allPunches } = await fetchPunches(record.id)
  const totalHours = calcHoursFromPunches(allPunches || [])
  const { data, error } = await checkOut(record.id, {
    check_out_time: now, check_out_lat: lat, check_out_lng: lng, check_out_address: address, total_hours: totalHours,
  })
  return { data, error }
}
