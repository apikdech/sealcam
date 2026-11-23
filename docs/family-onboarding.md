# How to watch the cameras: guide for the family

This guide is for family members who watch the cameras on a phone. It has four steps.

You need two things from the person who operates the system (the owner):

- The web address of the viewer. The address is a link.
- The key. The key is a text that starts with `zk1-`, or a QR picture.

## 1. Install Tailscale

The viewer is private. It opens only on devices in the Tailscale network of your family.

1. Install the Tailscale app from the App Store or Google Play.
2. Sign in with the account that the owner invited.
3. Turn on Tailscale.
4. Keep Tailscale on when you watch.

## 2. Open the address

1. Open the address from the owner in Safari (iPhone) or Chrome (Android).
2. Make sure that the zview page shows "Add the family key".

The address looks like `https://<host>.<name>.ts.net`.

If the page does not open, make sure that Tailscale is on.

## 3. Add zview to your Home Screen

On an iPhone (Safari):

1. Tap Share.
2. Tap **Add to Home Screen**.
3. Tap **Add**.

On an Android phone (Chrome):

1. Tap the menu (three dots).
2. Tap **Install app** or **Add to Home screen**.

From now on, open zview from the new icon.

> **Note:** On an iPhone, the Home Screen app has its own storage. This storage is separate from
> Safari. Do step 4 in the Home Screen app, not in Safari.

## 4. Add the key

1. In zview, find **Family key**. On a new device, this is the first screen.
2. Add the key in one of these three ways:
   - Tap **Scan QR code**. Let the app use the camera. Point the camera at the QR picture from
     the owner.
   - Tap **Use a photo of the QR code**. Choose the picture that the owner sent you.
   - Paste the `zk1-...` text into **Family key**. Then tap **Add key**.
3. Look at the screen. The app shows **Key added**, a round fingerprint picture, and a short
   fingerprint.
4. Make sure that the fingerprint is the same as the fingerprint from the owner.
5. If the app shows "typo in key", the text has an error. Copy the key again and try again.
6. If the phone is your own phone, tap **Keep it on this phone**.
7. If the phone is a shared phone, tap **Only for now**.
8. Tap **Open Home**.

## Use zview

zview opens on one screen. It shows the live cameras and the events of today.

- To watch a recording, tap an event. The recording plays in the same place.
- To go back to the live cameras, tap **Live** on the video.
- To see another day, use the arrows at the top.
- To pick a date, tap the day name.
- To change the colors, tap the theme button. You can choose System, Light or Dark.
- To lock zview, tap the key button. Then tap **Lock now**.
- To manage the keys, tap the key button. Then tap **Manage keys**.

## Important information

> **Warning:** The key never goes into a link, a message, or the address bar. Do not give the key
> to persons outside the family. A person with the key and Tailscale access can watch the
> cameras.

To remove the key from a device:

1. Tap the key button at the top.
2. Tap **Manage keys**.
3. Tap **Forget** next to the key.
4. Tap **Forget key** to confirm.

If you lose a phone, tell the owner immediately.

Other things to know:

- When an update is available, the app shows "New version available — reload". Tap reload when
  no video plays.
- Each recording has a round seal. The seal shows the result of the check that the app did on
  the recording. A full round pattern means **Encrypted recording verified**.
- If the app says **Failed verification** or "This recording failed verification at ~mm:ss", the
  file was changed or is damaged. Tell the owner.
- If the app says **Recording was interrupted**, the recording is not complete. Tell the owner.
- If the app says **Metadata mismatch**, the description of the recording does not agree with
  the recording. Tell the owner.
- If the app says **Recorded with another key**, you do not have the key for this recording. Ask
  the owner for that key.
