import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
  getTestDatabase,
} from '../../helpers/db-container';
import {
  createMockAuthContext,
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../helpers/auth-helper';
import {
  createMockAPIContext,
  parseJSONResponse,
  createJSONRequest,
} from '../../helpers/api-helper';
import {
  createPatient,
  createPzkCategories,
  createPzkMaterial,
  createPzkMaterialsSet,
  createPzkModuleAccess,
  createPzkMaterialPdf,
  createPzkMaterialVideo,
  createPzkNote,
  createPzkReview,
} from '../../fixtures';
import { pzkCategories } from '@/db/schema';

describe('PZK Test Setup Verification', () => {
  let db: any;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('Database Helper', () => {
    it('should start test database', () => {
      expect(db).toBeDefined();
      expect(getTestDatabase()).toBeDefined();
    });

    it('should clean all PZK tables', async () => {
      // Create some data
      const categories = await createPzkCategories(db);
      expect(categories).toHaveLength(3);

      // Clean database
      await cleanDatabase(db);

      // Verify tables are empty
      const categoriesAfter = await db.select().from(pzkCategories);
      expect(categoriesAfter).toHaveLength(0);
    });
  });

  describe('Auth Helper', () => {
    it('should create mock patient context', () => {
      const locals = createMockPatient({ id: 'patient-1', email: 'test@example.com' });

      expect(locals.user).toBeDefined();
      expect(locals.user?.id).toBe('patient-1');
      expect(locals.user?.role).toBe('patient');
      expect(locals.user?.email).toBe('test@example.com');
    });

    it('should create mock dietitian context', () => {
      const locals = createMockDietitian({ id: 'dietitian-1' });

      expect(locals.user).toBeDefined();
      expect(locals.user?.id).toBe('dietitian-1');
      expect(locals.user?.role).toBe('dietitian');
    });

    it('should create mock unauthenticated context', () => {
      const locals = createMockUnauthenticated();

      expect(locals.user).toBeNull();
      expect(locals.session).toBeNull();
    });

    it('should create generic auth context', () => {
      const locals = createMockAuthContext({
        user: { id: 'custom-1', role: 'patient' },
      });

      expect(locals.user).toBeDefined();
      expect(locals.user?.id).toBe('custom-1');
    });
  });

  describe('API Helper', () => {
    it('should create mock API context', () => {
      const context = createMockAPIContext({
        url: 'http://localhost/api/test',
        locals: createMockPatient({ id: 'patient-1' }),
      });

      expect(context.url.pathname).toBe('/api/test');
      expect(context.locals.user?.id).toBe('patient-1');
    });

    it('should create JSON request', () => {
      const request = createJSONRequest('http://localhost/api/test', {
        method: 'POST',
        body: { test: 'value' },
      });

      expect(request.method).toBe('POST');
      expect(request.headers.get('Content-Type')).toBe('application/json');
    });

    it('should parse JSON response', async () => {
      const response = new Response(JSON.stringify({ data: 'test' }), {
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await parseJSONResponse(response);
      expect(json).toEqual({ data: 'test' });
    });
  });

  describe('PZK Fixtures', () => {
    it('should create PZK categories', async () => {
      const categories = await createPzkCategories(db);

      expect(categories).toHaveLength(3);
      expect(categories[0].slug).toBe('podstawy');
      expect(categories[1].slug).toBe('zywienie');
      expect(categories[2].slug).toBe('cwiczenia');
    });

    it('should create PZK material', async () => {
      const categories = await createPzkCategories(db);
      const material = await createPzkMaterial(db, {
        module: 1,
        categoryId: categories[0].id,
        title: 'Test Material',
        status: 'published',
      });

      expect(material.id).toBeDefined();
      expect(material.module).toBe(1);
      expect(material.title).toBe('Test Material');
      expect(material.status).toBe('published');
    });

    it('should create PZK materials set (9 materials)', async () => {
      const { categories, materials } = await createPzkMaterialsSet(db);

      expect(categories).toHaveLength(3);
      expect(materials).toHaveLength(9);

      // Module 1: 2 published, 1 publish_soon
      const module1Materials = materials.filter((m) => m.module === 1);
      expect(module1Materials).toHaveLength(3);
      expect(module1Materials.filter((m) => m.status === 'published')).toHaveLength(2);
      expect(module1Materials.filter((m) => m.status === 'publish_soon')).toHaveLength(1);

      // Module 2: 3 published
      const module2Materials = materials.filter((m) => m.module === 2);
      expect(module2Materials).toHaveLength(3);
      expect(module2Materials.filter((m) => m.status === 'published')).toHaveLength(3);

      // Module 3: 1 published, 1 draft, 1 archived
      const module3Materials = materials.filter((m) => m.module === 3);
      expect(module3Materials).toHaveLength(3);
      expect(module3Materials.filter((m) => m.status === 'published')).toHaveLength(1);
      expect(module3Materials.filter((m) => m.status === 'draft')).toHaveLength(1);
      expect(module3Materials.filter((m) => m.status === 'archived')).toHaveLength(1);
    });

    it('should create PZK material PDF', async () => {
      const { materials } = await createPzkMaterialsSet(db);
      const pdf = await createPzkMaterialPdf(db, {
        materialId: materials[0].id,
        fileName: 'test.pdf',
        objectKey: 'pzk/test.pdf',
      });

      expect(pdf.id).toBeDefined();
      expect(pdf.materialId).toBe(materials[0].id);
      expect(pdf.fileName).toBe('test.pdf');
    });

    it('should create PZK material video', async () => {
      const { materials } = await createPzkMaterialsSet(db);
      const video = await createPzkMaterialVideo(db, {
        materialId: materials[0].id,
        youtubeVideoId: 'dQw4w9WgXcQ',
        title: 'Test Video',
      });

      expect(video.id).toBeDefined();
      expect(video.materialId).toBe(materials[0].id);
      expect(video.youtubeVideoId).toBe('dQw4w9WgXcQ');
    });

    it('should create PZK module access', async () => {
      const patient = await createPatient(db, { email: 'patient@example.com' });
      const access = await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
      });

      expect(access.id).toBeDefined();
      expect(access.userId).toBe(patient.id);
      expect(access.module).toBe(1);
      expect(access.startAt).toBeDefined();
      expect(access.expiresAt).toBeDefined();
      expect(access.revokedAt).toBeNull();
    });

    it('should create PZK note', async () => {
      const patient = await createPatient(db, { email: 'patient@example.com' });
      const { materials } = await createPzkMaterialsSet(db);
      const note = await createPzkNote(db, {
        userId: patient.id,
        materialId: materials[0].id,
        content: 'My test notes',
      });

      expect(note.id).toBeDefined();
      expect(note.userId).toBe(patient.id);
      expect(note.materialId).toBe(materials[0].id);
      expect(note.content).toBe('My test notes');
    });

    it('should create PZK review', async () => {
      const patient = await createPatient(db, { email: 'patient@example.com' });
      const review = await createPzkReview(db, {
        userId: patient.id,
        rating: 5,
        content: 'Great program!',
      });

      expect(review.id).toBeDefined();
      expect(review.userId).toBe(patient.id);
      expect(review.rating).toBe(5);
      expect(review.content).toBe('Great program!');
    });
  });
});
