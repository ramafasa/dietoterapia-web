import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../helpers/db-container';
import {
  createPzkMaterialsSet,
  createPzkMaterialPdf,
} from '../../fixtures';
import { PzkMaterialPdfRepository } from '@/lib/repositories/pzkMaterialPdfRepository';

describe('PzkMaterialPdfRepository', () => {
  let db: any;
  let repository: PzkMaterialPdfRepository;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
    repository = new PzkMaterialPdfRepository(db);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('listByMaterialId()', () => {
    it('should return PDFs sorted by displayOrder ASC', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];

      // Create PDFs in non-sorted order: 3, 1, 2
      await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'third.pdf',
        displayOrder: 3,
      });
      await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'first.pdf',
        displayOrder: 1,
      });
      await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'second.pdf',
        displayOrder: 2,
      });

      // Act
      const result = await repository.listByMaterialId(material.id);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].displayOrder).toBe(1);
      expect(result[1].displayOrder).toBe(2);
      expect(result[2].displayOrder).toBe(3);
      expect(result[0].fileName).toBe('first.pdf');
      expect(result[1].fileName).toBe('second.pdf');
      expect(result[2].fileName).toBe('third.pdf');
    });

    it('should return empty array for material without PDFs', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];

      // Act
      const result = await repository.listByMaterialId(material.id);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return correct fields: id, fileName, displayOrder (NOT objectKey)', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];

      await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'test.pdf',
        objectKey: 'pzk/secret/test.pdf',
        displayOrder: 1,
      });

      // Act
      const result = await repository.listByMaterialId(material.id);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('fileName', 'test.pdf');
      expect(result[0]).toHaveProperty('displayOrder', 1);
      expect(result[0]).not.toHaveProperty('objectKey'); // Security: objectKey NOT exposed
      expect(result[0]).not.toHaveProperty('materialId');
    });

    it('should only return PDFs for specified material (not other materials)', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material1 = materials[0];
      const material2 = materials[1];

      // Create PDF for material 1
      await createPzkMaterialPdf(db, {
        materialId: material1.id,
        fileName: 'material1.pdf',
        displayOrder: 1,
      });

      // Create PDF for material 2
      await createPzkMaterialPdf(db, {
        materialId: material2.id,
        fileName: 'material2.pdf',
        displayOrder: 1,
      });

      // Act
      const result = await repository.listByMaterialId(material1.id);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].fileName).toBe('material1.pdf');
    });
  });

  describe('findByMaterialIdAndPdfId() - IDOR Protection', () => {
    it('should return PDF when both materialId and pdfId match', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];

      const pdf = await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'test.pdf',
        objectKey: 'pzk/test.pdf',
        displayOrder: 1,
      });

      // Act
      const result = await repository.findByMaterialIdAndPdfId(
        material.id,
        pdf.id
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(pdf.id);
      expect(result!.materialId).toBe(material.id);
      expect(result!.objectKey).toBe('pzk/test.pdf');
      expect(result!.fileName).toBe('test.pdf');
    });

    it('should return null when PDF does not exist', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];
      // Use valid UUID format for non-existent PDF
      const nonExistentPdfId = '00000000-0000-0000-0000-000000000999';

      // Act
      const result = await repository.findByMaterialIdAndPdfId(
        material.id,
        nonExistentPdfId
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when PDF exists but materialId does NOT match (IDOR protection)', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material1 = materials[0];
      const material2 = materials[1];

      // Create PDF for material1
      const pdf = await createPzkMaterialPdf(db, {
        materialId: material1.id,
        fileName: 'material1.pdf',
        objectKey: 'pzk/material1.pdf',
        displayOrder: 1,
      });

      // Act: Try to access PDF via material2 (IDOR attempt)
      const result = await repository.findByMaterialIdAndPdfId(
        material2.id,
        pdf.id
      );

      // Assert: Should return null (PDF belongs to material1, not material2)
      expect(result).toBeNull();
    });

    it('should return all fields including objectKey (for presign internal use)', async () => {
      // Arrange
      const { materials } = await createPzkMaterialsSet(db);
      const material = materials[0];

      const pdf = await createPzkMaterialPdf(db, {
        materialId: material.id,
        fileName: 'secure.pdf',
        objectKey: 'pzk/secret/secure.pdf',
        displayOrder: 5,
      });

      // Act
      const result = await repository.findByMaterialIdAndPdfId(
        material.id,
        pdf.id
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: pdf.id,
        materialId: material.id,
        objectKey: 'pzk/secret/secure.pdf',
        fileName: 'secure.pdf',
        displayOrder: 5,
      });
    });
  });
});
