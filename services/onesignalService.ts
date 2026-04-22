// onesignalService.ts
import axios from 'axios';
import { IUser } from '../models/user_model';

// Environment variables with proper typing
const ONESIGNAL_APP_ID = '2c0e56a2-f8cf-4a11-a4d6-c65482bb6005';
const ONESIGNAL_API_KEY = "os_v2_app_fqhfnixyz5fbdjgwyzkifo3aawuhqlhsdipexp4pusanzxqq7r5cbwsb4ipnhjtpbaouu7znjcvmh3e345t5go6jlrciakpb7ztin6a";
const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

// Type definitions
interface INotificationData {
    [key: string]: any;
}

interface INotificationResponse {
    id: string;
    recipients: number;
    external_id?: string;
    errors?: string[];
    [key: string]: any;
}

/**
 * Send push notification to a specific user using their single player ID
 */
export async function sendPushToUser(
    user: IUser,
    title: string,
    message: string,
    data: INotificationData = {}
): Promise<INotificationResponse | null> {
    try {
        // Validate user has a player ID
        if (!user.onesignalPlayerId || !user.onesignalPlayerId.playerId) {
            console.log('User has no registered device for push notifications');
            return null;
        }

        const playerId = user.onesignalPlayerId.playerId;
        const deviceType = user.onesignalPlayerId.deviceType; // 'ios' or 'android'

        if (!playerId || playerId.length === 0) {
            console.log('No valid player ID found for user');
            return null;
        }

        console.log('Sending push notification to player ID:', playerId);
        console.log('Using App ID:', ONESIGNAL_APP_ID);
        console.log('API Key exists:', !!ONESIGNAL_API_KEY);

        // Build notification
        const notification = {
            app_id: ONESIGNAL_APP_ID,
            headings: { en: title },
            contents: { en: message },
            include_player_ids: [playerId],
            // android_channel_id: "general_notifications",
            data: {
                ...data,
                timestamp: new Date().toISOString(),
            },
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
            ios_sound: 'default',
            android_sound: 'default',
        };

        // ✅ Add iOS‑specific fields only for iOS devices
        if (deviceType === 'ios') {
            notification.ios_sound = 'default';
            notification.ios_badgeType = 'Increase';
            notification.ios_badgeCount = 1;
        } else {
            // Android‑specific fields
            notification.android_sound = 'default';

            // notification.android_channel_id = 'ride_requests'; // optional: create a channel
        }

        const response = await axios.post(ONESIGNAL_API_URL, notification, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${ONESIGNAL_API_KEY}`
            }
        });

        console.log('OneSignal response:', response.data);
        return response.data;

    } catch (error: any) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('OneSignal API Error Response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                headers: error.response.headers
            });

            // Log specific error message from OneSignal
            if (error.response.data && error.response.data.errors) {
                console.error('OneSignal Error Details:', error.response.data.errors);
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('OneSignal No Response:', error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('OneSignal Request Error:', error.message);
        }

        // Don't throw error to prevent disrupting the main flow
        // Just log and return null
        return null;
    }
}



export async function broadcastRideRequestToDrivers(
    user: any,
    rideData: {
        pickupAddress: string;
        riderName?: string;
        dropoffAddress?: string;
        fare?: number;
    },
    rideId: string
): Promise<INotificationResponse | null> {
    try {
        // ... existing validation ...

        const driverPlayerId = user.onesignalPlayerId.playerId;
        const deviceType = user.onesignalPlayerId.deviceType; // 'ios' or 'android'

        // Build base notification
        const notification: any = {
            app_id: ONESIGNAL_APP_ID,
            headings: { en: 'New Ride Request Nearby' },
            contents: {
                en: `🚗 New order request! ${rideData.pickupAddress.substring(0, 50)}`
            },
            include_player_ids: [driverPlayerId],
            buttons: [
                { id: 'accept', text: 'Accept', icon: 'ic_accept' },
                { id: 'reject', text: 'Reject', icon: 'ic_reject' }
            ],
            data: {
                rideId,
                rideRequest: rideData,
                type: 'ride_request'
            },
            priority: 10
        };

        // ✅ Add iOS‑specific fields only for iOS devices
        if (deviceType === 'ios') {
            notification.ios_interruption_level = 'time-sensitive';
            notification.ios_sound = 'default';
            notification.ios_badgeType = 'Increase';
            notification.ios_badgeCount = 1;
        } else {
            // Android‑specific fields
            notification.android_sound = 'default';

            // notification.android_channel_id = 'ride_requests'; // optional: create a channel
        }

        const response = await axios.post(ONESIGNAL_API_URL, notification, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${ONESIGNAL_API_KEY}`
            }
        });

        console.log(`✅ Notification sent to ${deviceType} driver ${driverPlayerId}`);
        return response.data;
    } catch (error: any) {
        console.error('Error broadcasting notification:', error.response?.data || error.message);
        return null;
    }
}





/**
 * Alternative method using external user ID (more reliable)
 */
export async function sendPushToUserByExternalId(
    userId: string,
    title: string,
    message: string,
    data: INotificationData = {}
): Promise<INotificationResponse | null> {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }

        const notification = {
            app_id: ONESIGNAL_APP_ID,
            headings: { en: title },
            contents: { en: message },
            include_aliases: {
                external_id: [userId]
            },
            target_channel: 'push',
            data: {
                ...data,
                timestamp: new Date().toISOString()
            },
            ios_badgeType: 'Increase',
            ios_badgeCount: 1,
            ios_sound: 'default',
            android_sound: 'default',
            priority: 10
        };

        const response = await axios.post(ONESIGNAL_API_URL, notification, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_API_KEY}`
            }
        });

        return response.data;
    } catch (error: any) {
        console.error('Failed to send push notification by external ID:', error.response?.data || error.message);
        return null;
    }
}

// Test function to verify OneSignal credentials
export async function testOneSignalCredentials(): Promise<boolean> {
    try {
        const testNotification = {
            app_id: ONESIGNAL_APP_ID,
            contents: { en: 'Test notification' },
            included_segments: ['Subscribed Users'],
            data: { test: true }
        };

        const response = await axios.post(ONESIGNAL_API_URL, testNotification, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_API_KEY}`
            }
        });

        console.log('OneSignal test successful:', response.data);
        return true;
    } catch (error: any) {
        console.error('OneSignal test failed:', error.response?.data || error.message);
        return false;
    }
}