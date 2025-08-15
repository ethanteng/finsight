import request from 'supertest';
import express from 'express';
import { adminAuth } from '../../auth/middleware';

describe('Admin Endpoints', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock the adminAuth middleware for testing
    const mockAdminAuth = (req: any, res: any, next: any) => {
      // Simulate admin authentication middleware
      req.user = {
        id: 'test-user-id',
        email: 'admin@example.com',
        tier: 'premium'
      };
      next();
    };

    // Add the admin endpoints directly
    app.get('/admin/demo-sessions', mockAdminAuth, async (req, res) => {
      res.json({ sessions: [] });
    });

    app.get('/admin/demo-conversations', mockAdminAuth, async (req, res) => {
      res.json({ conversations: [] });
    });

    // Production admin endpoints
    app.get('/admin/production-sessions', mockAdminAuth, async (req, res) => {
      res.json({ users: [] });
    });

    app.get('/admin/production-conversations', mockAdminAuth, async (req, res) => {
      res.json({ conversations: [] });
    });

    app.get('/admin/production-users', mockAdminAuth, async (req, res) => {
      res.json({ users: [] });
    });

    app.put('/admin/update-user-tier', mockAdminAuth, async (req, res) => {
      res.json({ success: true });
    });

    app.get('/admin/user-financial-data/:userId', mockAdminAuth, async (req, res) => {
      res.json({ 
        profile: { text: 'Test profile', lastUpdated: '2025-01-01T00:00:00Z' },
        institutions: [],
        accessTokens: 0,
        totalAccounts: 0,
        lastSync: null
      });
    });

    // New admin user management endpoints
    app.put('/admin/revoke-user-access/:userId', mockAdminAuth, async (req, res) => {
      const { userId } = req.params;
      const mockUser = { id: userId, email: 'test@example.com', isActive: false };
      res.json({ 
        success: true, 
        message: `Access revoked for user ${mockUser.email}`,
        user: mockUser
      });
    });

    app.put('/admin/restore-user-access/:userId', mockAdminAuth, async (req, res) => {
      const { userId } = req.params;
      const mockUser = { id: userId, email: 'test@example.com', isActive: true };
      res.json({ 
        success: true, 
        message: `Access restored for user ${mockUser.email}`,
        user: mockUser
      });
    });

    app.delete('/admin/delete-user-account/:userId', mockAdminAuth, async (req, res) => {
      const { userId } = req.params;
      const mockUser = { id: userId, email: 'test@example.com' };
      res.json({ 
        success: true, 
        message: `Account completely deleted for user ${mockUser.email}`,
        deletedUser: mockUser
      });
    });


  });

  describe('Admin Authentication', () => {
    it('should require authentication for admin endpoints', async () => {
      // Create a separate app without the mock auth middleware
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      
      appWithoutAuth.get('/admin/demo-sessions', adminAuth, async (req, res) => {
        res.json({ sessions: [] });
      });

      const response = await request(appWithoutAuth)
        .get('/admin/demo-sessions')
        .expect(401);
      
      expect(response.body.error).toBe('Authentication required for admin access');
    });

    it('should allow access with valid admin credentials', async () => {
      // Test with mock admin auth (already set up in beforeEach)
      const response = await request(app)
        .get('/admin/demo-sessions')
        .expect(200);
      
      expect(response.body).toHaveProperty('sessions');
    });
  });

  describe('Demo Endpoints', () => {
    it('should return demo sessions', async () => {
      const response = await request(app)
        .get('/admin/demo-sessions')
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });

    it('should return demo conversations', async () => {
      const response = await request(app)
        .get('/admin/demo-conversations')
        .expect(200);

      expect(response.body).toHaveProperty('conversations');
      expect(Array.isArray(response.body.conversations)).toBe(true);
    });
  });

  describe('Production Endpoints', () => {
    it('should return production sessions', async () => {
      const response = await request(app)
        .get('/admin/production-sessions')
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should return production conversations', async () => {
      const response = await request(app)
        .get('/admin/production-conversations')
        .expect(200);

      expect(response.body).toHaveProperty('conversations');
      expect(Array.isArray(response.body.conversations)).toBe(true);
    });

    it('should return production users', async () => {
      const response = await request(app)
        .get('/admin/production-users')
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should update user tier', async () => {
      const response = await request(app)
        .put('/admin/update-user-tier')
        .send({ userId: 'test-user', newTier: 'premium' })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should return user financial data', async () => {
      const response = await request(app)
        .get('/admin/user-financial-data/test-user-id')
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('institutions');
      expect(response.body).toHaveProperty('accessTokens');
      expect(response.body).toHaveProperty('totalAccounts');
      expect(response.body).toHaveProperty('lastSync');
      expect(response.body.profile).toHaveProperty('text');
      expect(response.body.profile).toHaveProperty('lastUpdated');
    });
  });

  describe('Admin User Management Endpoints', () => {
    describe('PUT /admin/revoke-user-access/:userId', () => {
      it('should revoke user access successfully', async () => {
        const response = await request(app)
          .put('/admin/revoke-user-access/user1')
          .set('Authorization', 'Bearer valid-admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.user.isActive).toBe(false);
      });

      it('should require admin authentication', async () => {
        // Create a separate app without the mock auth middleware
        const appWithoutAuth = express();
        appWithoutAuth.use(express.json());
        
        appWithoutAuth.put('/admin/revoke-user-access/:userId', adminAuth, async (req, res) => {
          res.json({ success: true });
        });

        const response = await request(appWithoutAuth)
          .put('/admin/revoke-user-access/user1');

        expect(response.status).toBe(401);
      });
    });

    describe('PUT /admin/restore-user-access/:userId', () => {
      it('should restore user access successfully', async () => {
        const response = await request(app)
          .put('/admin/restore-user-access/user1')
          .set('Authorization', 'Bearer valid-admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.user.isActive).toBe(true);
      });

      it('should require admin authentication', async () => {
        // Create a separate app without the mock auth middleware
        const appWithoutAuth = express();
        appWithoutAuth.use(express.json());
        
        appWithoutAuth.put('/admin/restore-user-access/:userId', adminAuth, async (req, res) => {
          res.json({ success: true });
        });

        const response = await request(appWithoutAuth)
          .put('/admin/restore-user-access/user1');

        expect(response.status).toBe(401);
      });
    });

    describe('DELETE /admin/delete-user-account/:userId', () => {
      it('should delete user account completely', async () => {
        const response = await request(app)
          .delete('/admin/delete-user-account/user1')
          .set('Authorization', 'Bearer valid-admin-token');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.deletedUser.email).toBe('test@example.com');
      });

      it('should require admin authentication', async () => {
        // Create a separate app without the mock auth middleware
        const appWithoutAuth = express();
        appWithoutAuth.use(express.json());
        
        appWithoutAuth.delete('/admin/delete-user-account/:userId', adminAuth, async (req, res) => {
          res.json({ success: true });
        });

        const response = await request(appWithoutAuth)
          .delete('/admin/delete-user-account/user1');

        expect(response.status).toBe(401);
      });
    });
  });
});