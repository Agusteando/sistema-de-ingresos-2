import { google } from 'googleapis';

export default defineEventHandler(async (event) => {
  const { email, name } = getQuery(event);
  
  // Fallback URL if Google lookup fails or user has no custom photo
  const fallbackUrl = `https://ui-avatars.com/api/?name=${name || email || 'User'}&background=eef2ff&color=4f46e5&bold=true&rounded=true&size=128`;

  if (!email || email === 'undefined') {
    return sendRedirect(event, fallbackUrl);
  }

  try {
    const config = useRuntimeConfig();
    
    // Authenticate with Domain-Wide Delegation (Impersonating the Workspace Admin)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.gcpClientEmail,
        private_key: config.gcpPrivateKey?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      clientOptions: {
        subject: config.gcpAdminSubject,
      }
    });

    const service = google.admin({ version: 'directory_v1', auth });

    // Fetch the photo from Google Workspace
    const res = await service.users.photos.get({
      userKey: email as string,
    });

    if (res.data.photoData) {
      // Decode the URL-safe base64 response into a raw binary buffer
      const buffer = Buffer.from(res.data.photoData, 'base64');
      
      // Serve as a direct image with browser caching to reduce API quota usage
      setResponseHeader(event, 'Content-Type', 'image/jpeg');
      setResponseHeader(event, 'Cache-Control', 'public, max-age=86400');
      return buffer;
    }
  } catch (error) {
    // Fail silently (e.g., 404 if user has no photo set) and proceed to fallback
    console.warn(`[Photo API] No photo found or error for ${email}`);
  }

  // Redirect to generated initials avatar
  return sendRedirect(event, fallbackUrl);
});