import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../auth/utils';

const prisma = new PrismaClient();

describe('Forgot Password and Email Verification', () => {
  let testUser: any;

  beforeEach(async () => {
    // Clean up test data
    await prisma.emailVerificationCode.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });

    // Create test user
    const passwordHash = await hashPassword('password123');
    testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash,
        tier: 'starter'
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.emailVerificationCode.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });
  });

  describe('POST /auth/forgot-password', () => {
    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('password reset link has been sent');

      // Verify reset token was created
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: { userId: testUser.id }
      });
      expect(resetToken).toBeDefined();
      expect(resetToken?.token).toBeDefined();
    });

    it('should not reveal if user exists for non-existent email', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('password reset link has been sent');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid email format');
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/forgot-password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is required');
    });
  });

  describe('POST /auth/reset-password', () => {
    let resetToken: any;

    beforeEach(async () => {
      // Create a reset token
      resetToken = await prisma.passwordResetToken.create({
        data: {
          token: 'test-reset-token',
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        }
      });
    });

    it('should reset password with valid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'test-reset-token',
          newPassword: 'NewPassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset successfully');

      // Verify token was marked as used
      const updatedToken = await prisma.passwordResetToken.findUnique({
        where: { id: resetToken.id }
      });
      expect(updatedToken?.used).toBe(true);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewPassword123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or expired reset token');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({
          token: 'test-reset-token',
          newPassword: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Password must be at least 8 characters long');
    });

    it('should reject missing token or password', async () => {
      const response = await request(app)
        .post('/auth/reset-password')
        .send({ token: 'test-reset-token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token and new password are required');
    });
  });

  describe('POST /auth/send-verification', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      authToken = loginResponse.body.token;
    });

    it('should send verification code for authenticated user', async () => {
      const response = await request(app)
        .post('/auth/send-verification')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Verification code sent to your email');

      // Verify code was created
      const verificationCode = await prisma.emailVerificationCode.findFirst({
        where: { userId: testUser.id }
      });
      expect(verificationCode).toBeDefined();
      expect(verificationCode?.code).toBeDefined();
    });

    it('should reject for already verified email', async () => {
      // Mark user as verified
      await prisma.user.update({
        where: { id: testUser.id },
        data: { emailVerified: true }
      });

      const response = await request(app)
        .post('/auth/send-verification')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is already verified');
    });

    it('should reject without authentication', async () => {
      const response = await request(app)
        .post('/auth/send-verification');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/verify-email', () => {
    let authToken: string;
    let verificationCode: any;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      authToken = loginResponse.body.token;

      // Create verification code
      verificationCode = await prisma.emailVerificationCode.create({
        data: {
          code: '123456',
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
        }
      });
    });

    it('should verify email with valid code', async () => {
      const response = await request(app)
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Email verified successfully');

      // Verify user was marked as verified
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      expect(updatedUser?.emailVerified).toBe(true);

      // Verify code was marked as used
      const updatedCode = await prisma.emailVerificationCode.findUnique({
        where: { id: verificationCode.id }
      });
      expect(updatedCode?.used).toBe(true);
    });

    it('should reject invalid code', async () => {
      const response = await request(app)
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid verification code');
    });

    it('should reject expired code', async () => {
      // Create expired code
      await prisma.emailVerificationCode.update({
        where: { id: verificationCode.id },
        data: { expiresAt: new Date(Date.now() - 60 * 1000) } // 1 minute ago
      });

      const response = await request(app)
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '123456' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Verification code has expired');
    });

    it('should reject missing code', async () => {
      const response = await request(app)
        .post('/auth/verify-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Verification code is required');
    });
  });

  describe('POST /auth/resend-verification', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      authToken = loginResponse.body.token;
    });

    it('should resend verification code', async () => {
      const response = await request(app)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Verification code resent to your email');
    });

    it('should reject for already verified email', async () => {
      // Mark user as verified
      await prisma.user.update({
        where: { id: testUser.id },
        data: { emailVerified: true }
      });

      const response = await request(app)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is already verified');
    });

    it('should rate limit rapid requests', async () => {
      // Create a recent code to trigger rate limiting
      await prisma.emailVerificationCode.create({
        data: {
          code: '123456',
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          createdAt: new Date() // Recent
        }
      });

      const response = await request(app)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Please wait before requesting another verification code');
    });
  });
}); 