import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { TrackingEvent } from '../types';

const generateSessionId = () => {
  let sessionId = sessionStorage.getItem('tracking_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('tracking_session_id', sessionId);
  }
  return sessionId;
};

export const trackEvent = async (eventType: TrackingEvent['eventType'], details?: Record<string, any>) => {
  try {
    const sessionId = generateSessionId();
    await addDoc(collection(db, 'tracking_events'), {
      sessionId,
      eventType,
      details: details || {},
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to track event:", error);
  }
};
