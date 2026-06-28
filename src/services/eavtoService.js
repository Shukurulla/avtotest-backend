import axios from 'axios';
import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EavtoService {
  constructor() {
    this.apiUrl = process.env.EAVTO_API_URL;
    this.token = null;
    this.refreshToken = null;
    this.timeout = 60000; // 60 second timeout for slower VPS networks

    // Create axios instance with HTTPS agent for VPS compatibility
    this.axiosInstance = axios.create({
      timeout: this.timeout,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Accept self-signed certificates
        keepAlive: true,
        maxSockets: 10,
        family: 4, // Force IPv4 (some VPS have IPv6 issues)
      }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });
  }

  async login() {
    try {
      // Re-read apiUrl in case it wasn't set during construction
      if (!this.apiUrl) {
        this.apiUrl = process.env.EAVTO_API_URL;
      }

      if (!this.apiUrl) {
        throw new Error('EAVTO_API_URL environment variable is not set');
      }

      console.log('🔐 Attempting login to:', this.apiUrl);
      console.log('📡 Network configuration: IPv4-only, 60s timeout');

      const response = await this.axiosInstance.post(`${this.apiUrl}/login`, {
        username: process.env.EAVTO_USERNAME,
        password: process.env.EAVTO_PASSWORD,
        device: process.env.EAVTO_DEVICE || 'web',
        device_id: process.env.EAVTO_DEVICE_ID,
        model_device: process.env.EAVTO_MODEL_DEVICE || 'MacIntel',
        platform: process.env.EAVTO_PLATFORM || 'macOS',
      });

      console.log('📥 Received response with status:', response.status);

      // Check different possible response structures
      if (response.data && response.data.status === 1) {
        // Try different data structures - access_token, token, data.token
        if (response.data.access_token) {
          this.token = response.data.access_token;
          this.refreshToken = response.data.refresh_token;
        } else if (response.data.data && response.data.data.token) {
          this.token = response.data.data.token;
          this.refreshToken = response.data.data.refresh_token;
        } else if (response.data.token) {
          this.token = response.data.token;
          this.refreshToken = response.data.refresh_token;
        } else {
          console.error('❌ Token not found in response:', response.data);
          throw new Error('Token not found in API response');
        }

        console.log('✅ Successfully authenticated with Eavto API');
        console.log('Token:', this.token?.substring(0, 30) + '...');
        console.log('Refresh token:', this.refreshToken?.substring(0, 30) + '...');
        return true;
      }

      console.log('❌ Eavto API returned status:', response.data?.status);
      return false;
    } catch (error) {
      console.error('❌ Eavto login error:', error.message);

      if (error.code) {
        console.error('Error Code:', error.code);
      }

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received from server');
        console.error('Request config:', {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout,
        });
      }

      throw new Error(`Failed to authenticate with Eavto API: ${error.code || error.message}`);
    }
  }

  async refreshAuthToken() {
    try {
      const response = await this.axiosInstance.post(`${this.apiUrl}/auth/refresh-token`, {
        refresh_token: this.refreshToken,
      });

      if (response.data.status === 1) {
        this.token = response.data.data.token;
        return true;
      }

      // If refresh fails, try login again
      return await this.login();
    } catch (error) {
      console.error('Token refresh error:', error.message);
      return await this.login();
    }
  }

  async getTemplates() {
    try {
      const response = await this.axiosInstance.get(
        `${this.apiUrl}/student-exam-center-templates`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      if (response.data.status === 1) {
        return response.data.data.data;
      }

      return [];
    } catch (error) {
      console.error('Get templates error:', error.message);

      // Try to refresh token and retry
      if (error.response?.status === 401) {
        console.log('🔄 Token expired, refreshing...');
        await this.refreshAuthToken();
        return this.getTemplates();
      }

      throw new Error('Failed to fetch templates');
    }
  }

  async getTemplateQuestions(templateId, langId) {
    try {
      const url = `${this.apiUrl}/student-exam-center-test-template-start/${templateId}/${langId}`;

      const response = await this.axiosInstance.get(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        params: {
          token: this.token,
          template_id: templateId,
          lang_id: langId,
          'relations[]': ['exam_center_test_template', 'saved_test'],
        },
      });

      if (response.data.status === 1) {
        return response.data.data.questions || [];
      }

      return [];
    } catch (error) {
      // Log the full error for debugging
      if (error.response?.status === 429) {
        console.error(
          `⚠️ Rate limit hit (429) for template ${templateId}, lang ${langId}`
        );
      } else {
        console.error(
          `Get questions error (template: ${templateId}, lang: ${langId}):`,
          error.message
        );
      }

      // Try to refresh token and retry for 401
      if (error.response?.status === 401) {
        console.log('🔄 Token expired, refreshing...');
        await this.refreshAuthToken();
        return this.getTemplateQuestions(templateId, langId);
      }

      // Throw error to be handled by retry mechanism
      throw error;
    }
  }

  async downloadImage(imageUrl, questionId) {
    try {
      // Check if image URL is relative
      if (imageUrl && imageUrl.startsWith('/files/')) imageUrl = imageUrl.replace(/^\/files/, '');
      let fullUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        fullUrl = `http://back.eavtotalim.uz${imageUrl}`;
      }

      const response = await this.axiosInstance.get(fullUrl, {
        responseType: 'arraybuffer',
      });

      // Determine file extension from URL
      const ext = path.extname(imageUrl) || '.jpg';
      const fileName = `${questionId}${ext}`;

      const imagesDir = path.join(__dirname, '../../images');

      // Ensure images directory exists
      await fs.mkdir(imagesDir, { recursive: true });

      const filePath = path.join(imagesDir, fileName);

      await fs.writeFile(filePath, response.data);

      return `images/${fileName}`;
    } catch (error) {
      console.error(`Download image error (${imageUrl}):`, error.message);
      return null;
    }
  }

  async logout() {
    this.token = null;
    this.refreshToken = null;
  }
}

export default new EavtoService();
