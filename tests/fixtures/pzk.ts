import type { Database } from '@/db';
import {
  pzkCategories,
  pzkMaterials,
  pzkMaterialPdfs,
  pzkMaterialVideos,
  pzkModuleAccess,
  pzkNotes,
  pzkReviews,
} from '@/db/schema';

/**
 * Create default PZK categories (3 categories)
 *
 * @example
 * ```ts
 * const categories = await createPzkCategories(db);
 * ```
 */
export async function createPzkCategories(db: Database) {
  const categoryData = [
    {
      slug: 'podstawy',
      label: 'Podstawy',
      description: 'Podstawowe informacje o programie',
      displayOrder: 1,
    },
    {
      slug: 'zywienie',
      label: 'Żywienie',
      description: 'Materiały dotyczące zdrowego żywienia',
      displayOrder: 2,
    },
    {
      slug: 'cwiczenia',
      label: 'Ćwiczenia',
      description: 'Ćwiczenia i aktywność fizyczna',
      displayOrder: 3,
    },
  ];

  return await db.insert(pzkCategories).values(categoryData).returning();
}

/**
 * Create a PZK material
 *
 * @example
 * ```ts
 * const material = await createPzkMaterial(db, {
 *   module: 1,
 *   categoryId: category.id,
 *   title: 'Pierwszy materiał',
 *   status: 'published'
 * });
 * ```
 */
export async function createPzkMaterial(
  db: Database,
  overrides: {
    module: 1 | 2 | 3;
    categoryId: string;
    title?: string;
    description?: string;
    contentMd?: string;
    status?: 'draft' | 'published' | 'archived' | 'publish_soon';
    order?: number;
  }
) {
  const {
    module,
    categoryId,
    title = 'Test Material',
    description = 'Test material description',
    contentMd = '# Test Content\n\nThis is test content.',
    status = 'published',
    order = 1,
  } = overrides;

  const [material] = await db
    .insert(pzkMaterials)
    .values({
      module,
      categoryId,
      title,
      description,
      contentMd,
      status,
      order,
    })
    .returning();

  return material;
}

/**
 * Create multiple PZK materials (3 modules × 1 category × 3 materials = 9 materials)
 *
 * @example
 * ```ts
 * const { categories, materials } = await createPzkMaterialsSet(db);
 * ```
 */
export async function createPzkMaterialsSet(db: Database) {
  const categories = await createPzkCategories(db);
  const category = categories[0]; // Use first category

  const materials = [];

  // Module 1: 3 materials (2 published, 1 publish_soon)
  materials.push(
    await createPzkMaterial(db, {
      module: 1,
      categoryId: category.id,
      title: 'Moduł 1 - Materiał 1',
      description: 'Pierwszy materiał z modułu 1',
      status: 'published',
      order: 1,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 1,
      categoryId: category.id,
      title: 'Moduł 1 - Materiał 2',
      description: 'Drugi materiał z modułu 1',
      status: 'published',
      order: 2,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 1,
      categoryId: category.id,
      title: 'Moduł 1 - Materiał 3 (wkrótce)',
      description: 'Trzeci materiał z modułu 1 (wkrótce)',
      status: 'publish_soon',
      order: 3,
    })
  );

  // Module 2: 3 materials (all published)
  materials.push(
    await createPzkMaterial(db, {
      module: 2,
      categoryId: category.id,
      title: 'Moduł 2 - Materiał 1',
      description: 'Pierwszy materiał z modułu 2',
      status: 'published',
      order: 1,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 2,
      categoryId: category.id,
      title: 'Moduł 2 - Materiał 2',
      description: 'Drugi materiał z modułu 2',
      status: 'published',
      order: 2,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 2,
      categoryId: category.id,
      title: 'Moduł 2 - Materiał 3',
      description: 'Trzeci materiał z modułu 2',
      status: 'published',
      order: 3,
    })
  );

  // Module 3: 3 materials (1 published, 1 draft, 1 archived)
  materials.push(
    await createPzkMaterial(db, {
      module: 3,
      categoryId: category.id,
      title: 'Moduł 3 - Materiał 1',
      description: 'Pierwszy materiał z modułu 3',
      status: 'published',
      order: 1,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 3,
      categoryId: category.id,
      title: 'Moduł 3 - Materiał 2 (draft)',
      description: 'Drugi materiał z modułu 3 (draft)',
      status: 'draft',
      order: 2,
    })
  );
  materials.push(
    await createPzkMaterial(db, {
      module: 3,
      categoryId: category.id,
      title: 'Moduł 3 - Materiał 3 (archived)',
      description: 'Trzeci materiał z modułu 3 (archived)',
      status: 'archived',
      order: 3,
    })
  );

  return { categories, materials };
}

/**
 * Create a PZK material PDF attachment
 *
 * @example
 * ```ts
 * const pdf = await createPzkMaterialPdf(db, {
 *   materialId: material.id,
 *   fileName: 'test.pdf'
 * });
 * ```
 */
export async function createPzkMaterialPdf(
  db: Database,
  overrides: {
    materialId: string;
    objectKey?: string;
    fileName?: string;
    displayOrder?: number;
  }
) {
  const {
    materialId,
    objectKey = 'test/test.pdf',
    fileName = 'test.pdf',
    displayOrder = 1,
  } = overrides;

  const [pdf] = await db
    .insert(pzkMaterialPdfs)
    .values({
      materialId,
      objectKey,
      fileName,
      displayOrder,
    })
    .returning();

  return pdf;
}

/**
 * Create a PZK material video
 *
 * @example
 * ```ts
 * const video = await createPzkMaterialVideo(db, {
 *   materialId: material.id,
 *   youtubeVideoId: 'dQw4w9WgXcQ'
 * });
 * ```
 */
export async function createPzkMaterialVideo(
  db: Database,
  overrides: {
    materialId: string;
    youtubeVideoId?: string;
    title?: string;
    displayOrder?: number;
  }
) {
  const {
    materialId,
    youtubeVideoId = 'dQw4w9WgXcQ',
    title = 'Test Video',
    displayOrder = 1,
  } = overrides;

  const [video] = await db
    .insert(pzkMaterialVideos)
    .values({
      materialId,
      youtubeVideoId,
      title,
      displayOrder,
    })
    .returning();

  return video;
}

/**
 * Create PZK module access for a user
 *
 * @example
 * ```ts
 * const access = await createPzkModuleAccess(db, {
 *   userId: user.id,
 *   module: 1
 * });
 * ```
 */
export async function createPzkModuleAccess(
  db: Database,
  overrides: {
    userId: string;
    module: 1 | 2 | 3;
    startAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date | null;
  }
) {
  const { userId, module, startAt, expiresAt, revokedAt = null } = overrides;

  const now = new Date();
  const defaultStartAt = startAt || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const defaultExpiresAt =
    expiresAt || new Date(defaultStartAt.getTime() + 365 * 24 * 60 * 60 * 1000); // 365 days from start

  const [access] = await db
    .insert(pzkModuleAccess)
    .values({
      userId,
      module,
      startAt: defaultStartAt,
      expiresAt: defaultExpiresAt,
      revokedAt,
    })
    .returning();

  return access;
}

/**
 * Create a PZK note for a material
 *
 * @example
 * ```ts
 * const note = await createPzkNote(db, {
 *   userId: user.id,
 *   materialId: material.id,
 *   content: 'My notes'
 * });
 * ```
 */
export async function createPzkNote(
  db: Database,
  overrides: {
    userId: string;
    materialId: string;
    content?: string;
  }
) {
  const { userId, materialId, content = 'Test note content' } = overrides;

  const [note] = await db
    .insert(pzkNotes)
    .values({
      userId,
      materialId,
      content,
    })
    .returning();

  return note;
}

/**
 * Create a PZK review
 *
 * @example
 * ```ts
 * const review = await createPzkReview(db, {
 *   userId: user.id,
 *   rating: 5,
 *   content: 'Great program!'
 * });
 * ```
 */
export async function createPzkReview(
  db: Database,
  overrides: {
    userId: string;
    rating?: number;
    content?: string;
  }
) {
  const { userId, rating = 5, content = 'Test review content' } = overrides;

  const [review] = await db
    .insert(pzkReviews)
    .values({
      userId,
      rating,
      content,
    })
    .returning();

  return review;
}

/**
 * Create multiple PZK reviews for testing pagination
 *
 * @example
 * ```ts
 * const reviews = await createPzkReviewsSet(db, userIds, 10);
 * ```
 */
export async function createPzkReviewsSet(
  db: Database,
  userIds: string[],
  count: number = 10
) {
  const reviews = [];

  for (let i = 0; i < count && i < userIds.length; i++) {
    const review = await createPzkReview(db, {
      userId: userIds[i],
      rating: Math.floor(Math.random() * 6) + 1, // Random rating 1-6
      content: `Review number ${i + 1}`,
    });
    reviews.push(review);
  }

  return reviews;
}
