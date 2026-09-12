import nodemailer from 'nodemailer';

import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('is false when SMTP env vars are unset', () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      expect(new MailService().isConfigured()).toBe(false);
    });

    it('is true once host, user, and pass are all set', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'secret';
      expect(new MailService().isConfigured()).toBe(true);
    });
  });

  describe('send', () => {
    it('reports not_configured without attempting a connection when SMTP is unset', async () => {
      delete process.env.SMTP_HOST;
      const result = await new MailService().send({ to: ['a@example.com'], subject: 'Hi', text: 'Body' });
      expect(result).toEqual({ sent: false, reason: 'not_configured' });
    });

    it('reports no_recipients for an empty recipient list, before checking configuration', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'secret';
      const result = await new MailService().send({ to: [], subject: 'Hi', text: 'Body' });
      expect(result).toEqual({ sent: false, reason: 'no_recipients' });
    });

    it('sends through nodemailer once SMTP is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'secret';
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      const result = await new MailService().send({ to: ['a@example.com'], subject: 'Digest', text: 'Body' });

      expect(result).toEqual({ sent: true });
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['a@example.com'], subject: 'Digest', text: 'Body' }),
      );
    });

    it('reports the error message instead of throwing when the transport rejects', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'secret';
      const sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

      const result = await new MailService().send({ to: ['a@example.com'], subject: 'Digest', text: 'Body' });

      expect(result).toEqual({ sent: false, reason: 'connection refused' });
    });
  });
});
