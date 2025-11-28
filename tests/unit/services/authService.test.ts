import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {SignupRequest} from '@/types';
import {signup} from '@/lib/services/authService';
import {
  EmailConflictError,
  InvalidInvitationError,
  MissingRequiredConsentsError
} from '@/lib/errors';
import {db} from '@/db';
import {invitationRepository} from '@/lib/repositories/invitationRepository';
import {userRepository} from '@/lib/repositories/userRepository';
import {consentRepository} from '@/lib/repositories/consentRepository';
import {auditLogRepository} from '@/lib/repositories/auditLogRepository';
import {eventRepository} from '@/lib/repositories/eventRepository';

const {hashMock} = vi.hoisted(() => ({
  hashMock: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {hash: hashMock},
  hash: hashMock,
}));

type InvitationStub = {
  id: string;
  email: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  token: string;
  createdAt: Date;
  createdBy: string;
};

type UserStub = {
  id: string;
  email: string;
  role: 'patient';
  firstName: string;
  lastName: string;
  age: number;
  gender: 'male' | 'female';
  status: 'active' | 'paused' | 'ended';
};

const buildSignupInput = (overrides: Partial<SignupRequest> = {}): SignupRequest => ({
  invitationToken: overrides.invitationToken ?? 'valid-token',
  email: overrides.email ?? 'patient@example.com',
  password: overrides.password ?? 'StrongPass123!',
  firstName: overrides.firstName ?? 'Anna',
  lastName: overrides.lastName ?? 'Nowak',
  age: overrides.age ?? 30,
  gender: overrides.gender ?? 'female',
  consents:
      overrides.consents ??
      [
        {
          type: 'data_processing',
          text: 'Zgoda na przetwarzanie danych',
          accepted: true,
        },
        {
          type: 'health_data',
          text: 'Zgoda na dane medyczne',
          accepted: true,
        },
      ],
});

const buildInvitation = (overrides: Partial<InvitationStub> = {}): InvitationStub => ({
  id: 'invitation-id',
  email: 'patient@example.com',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  usedAt: null,
  token: 'valid-token',
  createdAt: new Date(),
  createdBy: 'dietitian-id',
  ...overrides,
});

const buildUser = (overrides: Partial<UserStub> = {}): UserStub => ({
  id: 'user-123',
  email: 'patient@example.com',
  role: 'patient',
  firstName: 'Anna',
  lastName: 'Nowak',
  age: 30,
  gender: 'female',
  status: 'active',
  ...overrides,
});

const getByTokenSpy = vi.spyOn(invitationRepository, 'getByToken');
const markUsedSpy = vi.spyOn(invitationRepository, 'markUsed');
const findByEmailSpy = vi.spyOn(userRepository, 'findByEmail');
const createUserSpy = vi.spyOn(userRepository, 'createUser');
const createConsentsSpy = vi.spyOn(consentRepository, 'createMany');
const auditLogCreateSpy = vi.spyOn(auditLogRepository, 'create');
const eventCreateSpy = vi.spyOn(eventRepository, 'create');

let transactionMock: ReturnType<typeof vi.fn>;
let createdUser: UserStub;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  transactionMock = vi.fn(async (callback) => callback({}));
  (db as unknown as { transaction?: typeof transactionMock }).transaction = transactionMock;

  hashMock.mockResolvedValue('hashed-password');
  createdUser = buildUser();

  getByTokenSpy.mockResolvedValue(buildInvitation());
  markUsedSpy.mockResolvedValue();
  findByEmailSpy.mockResolvedValue(null);
  createUserSpy.mockResolvedValue(createdUser as any);
  createConsentsSpy.mockResolvedValue();
  auditLogCreateSpy.mockResolvedValue();
  eventCreateSpy.mockResolvedValue();

  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('authService.signup', () => {
  it('throws InvalidInvitationError when invitation token is unknown', async () => {
    getByTokenSpy.mockResolvedValueOnce(null);

    await expect(signup(buildSignupInput())).rejects.toBeInstanceOf(InvalidInvitationError);
    expect(getByTokenSpy).toHaveBeenCalledWith('valid-token');
  });

  it('throws InvalidInvitationError when invitation was already used', async () => {
    getByTokenSpy.mockResolvedValueOnce(buildInvitation({usedAt: new Date()}));

    await expect(signup(buildSignupInput())).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it('throws InvalidInvitationError when invitation expired', async () => {
    getByTokenSpy.mockResolvedValueOnce(
        buildInvitation({expiresAt: new Date(Date.now() - 60 * 1000)})
    );

    await expect(signup(buildSignupInput())).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it('throws InvalidInvitationError when signup email differs from invitation', async () => {
    getByTokenSpy.mockResolvedValueOnce(buildInvitation({email: 'other@example.com'}));

    await expect(signup(buildSignupInput())).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it('throws EmailConflictError when email is already registered', async () => {
    findByEmailSpy.mockResolvedValueOnce({id: 'existing-user'} as any);

    await expect(signup(buildSignupInput())).rejects.toBeInstanceOf(EmailConflictError);
    expect(findByEmailSpy).toHaveBeenCalledWith('patient@example.com');
  });

  it('throws MissingRequiredConsentsError when required consents are missing', async () => {
    const request = buildSignupInput({
      consents: [
        {
          type: 'data_processing',
          text: 'Zgoda na przetwarzanie danych',
          accepted: true,
        },
        {
          type: 'health_data',
          text: 'Zgoda na dane medyczne',
          accepted: false,
        },
      ],
    });

    await expect(signup(request)).rejects.toBeInstanceOf(MissingRequiredConsentsError);
    expect(createUserSpy).not.toHaveBeenCalled();
  });

  it('creates a patient and writes audit logs when all business rules pass', async () => {
    const request = buildSignupInput();
    const response = await signup(request);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(hashMock).toHaveBeenCalledWith(request.password, 10);
    expect(createUserSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: request.email,
          password: request.password,
          passwordHash: 'hashed-password',
          role: 'patient',
        })
    );
    expect(createConsentsSpy).toHaveBeenCalledWith(createdUser.id, request.consents);
    expect(markUsedSpy).toHaveBeenCalledWith('invitation-id', createdUser.id);
    expect(auditLogCreateSpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          action: 'create',
          tableName: 'users',
          recordId: createdUser.id,
        })
    );
    expect(auditLogCreateSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'update',
          tableName: 'invitations',
          recordId: 'invitation-id',
        })
    );
    expect(eventCreateSpy).toHaveBeenCalledWith({
      userId: createdUser.id,
      eventType: 'signup',
      properties: {
        role: 'patient',
        invitationId: 'invitation-id',
      },
    });
    expect(response).toEqual({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        age: createdUser.age,
        gender: createdUser.gender,
        status: createdUser.status,
      },
      userId: createdUser.id,
    });
  });

  it('swallows event tracking failures to keep signup best-effort', async () => {
    const trackingError = new Error('tracking failed');
    eventCreateSpy.mockRejectedValueOnce(trackingError);

    const response = await signup(buildSignupInput());
    expect(response.user.id).toBe(createdUser.id);
    expect(eventCreateSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[authService.signup] Event tracking failed:',
        trackingError
    );
  });
});


