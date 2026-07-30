import admin from 'firebase-admin';

type SerializedTimestamp = { __type: 'timestamp'; value: string };
type SerializedGeoPoint = { __type: 'geopoint'; latitude: number; longitude: number };
type SerializedDocRef = { __type: 'documentReference'; path: string };

export function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { __type: 'timestamp', value: value.toDate().toISOString() } satisfies SerializedTimestamp;
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    } satisfies SerializedGeoPoint;
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type: 'documentReference', path: value.path } satisfies SerializedDocRef;
  }
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeFirestoreValue(v)])
    );
  }
  return value;
}

export function deserializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const obj = value as Record<string, unknown>;
    if (obj.__type === 'timestamp' && typeof obj.value === 'string') {
      return admin.firestore.Timestamp.fromDate(new Date(obj.value));
    }
    if (obj.__type === 'geopoint') {
      return new admin.firestore.GeoPoint(Number(obj.latitude), Number(obj.longitude));
    }
    if (obj.__type === 'documentReference' && typeof obj.path === 'string') {
      return admin.firestore().doc(obj.path);
    }
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, deserializeFirestoreValue(v)])
    );
  }
  if (Array.isArray(value)) return value.map(deserializeFirestoreValue);
  return value;
}
