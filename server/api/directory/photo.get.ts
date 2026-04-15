import { google } from 'googleapis';

export default defineEventHandler(async (event) => {
  const { email, name } = getQuery(event);
  
  const fallbackUrl = `https://ui-avatars.com/api/?name=${name || email || 'User'}&background=eef2ff&color=4f46e5&bold=true&rounded=true&size=128`;

  if (!email || email === 'undefined') {
    return sendRedirect(event, fallbackUrl);
  }

  try {
    const config = useRuntimeConfig();
    
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

    const res = await service.users.photos.get({
      userKey: email as string,
    });

    if (res.data.photoData) {
      const buffer = Buffer.from(res.data.photoData, 'base64');
      setResponseHeader(event, 'Content-Type', 'image/jpeg');
      setResponseHeader(event, 'Cache-Control', 'public, max-age=86400');
      return buffer;
    }
  } catch (error) {
    console.warn(`[Photo API] No photo found or error for ${email}`);
  }

  return sendRedirect(event, fallbackUrl);
});