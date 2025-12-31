import type { Database } from '../index'
import {
  pzkCategories,
  pzkMaterials,
  pzkMaterialPdfs,
  pzkMaterialVideos,
  pzkModuleAccess,
  type NewPzkCategory,
  type NewPzkMaterial,
  type NewPzkMaterialPdf,
  type NewPzkMaterialVideo,
  type NewPzkModuleAccess,
} from '../schema'
import { eq, and } from 'drizzle-orm'

// ===== KATEGORIE =====
const categories: Omit<NewPzkCategory, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    slug: 'zywienie',
    label: 'Żywienie',
    description: 'Materiały dotyczące zdrowego odżywiania i zbilansowanej diety',
    displayOrder: 1,
  },
  {
    slug: 'psychologia',
    label: 'Psychologia jedzenia',
    description: 'Relacja z jedzeniem, emocje i mindful eating',
    displayOrder: 2,
  },
  {
    slug: 'aktywnosc',
    label: 'Aktywność fizyczna',
    description: 'Ruch, trening i zdrowie',
    displayOrder: 3,
  },
]

// ===== HELPER: Generowanie materiałów =====
interface MaterialData {
  module: number
  categorySlug: string
  order: number
  title: string
  description: string
  contentMd: string
  status: 'published' | 'publish_soon'
  hasPdf?: boolean
  hasVideo?: boolean
}

const materialsData: MaterialData[] = [
  // ===== MODUŁ 1 (PUBLISHED) =====
  // Żywienie (2 materiały)
  {
    module: 1,
    categorySlug: 'zywienie',
    order: 1,
    title: 'Wprowadzenie do zdrowego odżywiania',
    description: 'Podstawy zbilansowanej diety i zasady zdrowego odżywiania',
    status: 'published',
    hasPdf: true, // Ma PDF
    contentMd: `# Wprowadzenie do zdrowego odżywiania

Zdrowe odżywianie to fundament dobrego samopoczucia i zdrowia. W tym materiale poznasz podstawowe zasady zbilansowanej diety.

## Co to jest zdrowe odżywianie?

- Różnorodność produktów
- Odpowiednia ilość składników odżywczych
- Regularne posiłki
- Świadome wybory żywieniowe

## Dlaczego to ważne?

Zbilansowana dieta wpływa na:
- Poziom energii
- Samopoczucie psychiczne
- Zdrowie fizyczne
- Jakość snu`,
  },
  {
    module: 1,
    categorySlug: 'zywienie',
    order: 2,
    title: 'Makroskładniki - białko, tłuszcze, węglowodany',
    description: 'Rola makroskładników w diecie i ich źródła',
    status: 'published',
    contentMd: `# Makroskładniki

## Białko

Białko jest budulcem organizmu. Najlepsze źródła:
- Mięso i ryby
- Jaja
- Rośliny strączkowe
- Produkty mleczne

## Tłuszcze

Tłuszcze to energia i hormony. Wybieraj:
- Oliwę z oliwek
- Orzechy i nasiona
- Awokado
- Tłuste ryby

## Węglowodany

Węglowodany to paliwo dla mózgu i mięśni:
- Pełnoziarniste produkty
- Warzywa
- Owoce
- Kasze`,
  },

  // Psychologia (2 materiały)
  {
    module: 1,
    categorySlug: 'psychologia',
    order: 1,
    title: 'Relacja z jedzeniem',
    description: 'Jak budować zdrową relację z jedzeniem',
    status: 'published',
    hasVideo: true, // Ma film YouTube
    contentMd: `# Relacja z jedzeniem

Jedzenie to nie tylko paliwo - to także emocje, tradycja i przyjemność.

## Czym jest zdrowa relacja z jedzeniem?

- Słuchanie sygnałów głodu i sytości
- Brak poczucia winy po posiłkach
- Elastyczność w wyborach
- Akceptacja swojego ciała

## Jak ją budować?

1. Praktykuj mindful eating
2. Unikaj restrykcyjnych diet
3. Doceniaj smak jedzenia
4. Oddzielaj emocje od jedzenia`,
  },
  {
    module: 1,
    categorySlug: 'psychologia',
    order: 2,
    title: 'Mindful eating - uważne jedzenie',
    description: 'Praktyczne wskazówki dotyczące uważnego jedzenia',
    status: 'published',
    contentMd: `# Mindful eating

Uważne jedzenie to praktyka pełnej obecności podczas posiłków.

## Zasady mindful eating

- Jedz bez rozpraszaczy (telefon, TV)
- Zwracaj uwagę na smak i teksturę
- Jedz powoli
- Obserwuj sygnały głodu i sytości

## Korzyści

- Lepsza kontrola porcji
- Większa satysfakcja z jedzenia
- Mniejsze przejadanie się
- Redukcja stresu`,
  },

  // Aktywność (2 materiały)
  {
    module: 1,
    categorySlug: 'aktywnosc',
    order: 1,
    title: 'Rola ruchu w zdrowiu',
    description: 'Dlaczego aktywność fizyczna jest kluczowa dla zdrowia',
    status: 'published',
    contentMd: `# Rola ruchu w zdrowiu

Regularna aktywność fizyczna to jeden z filarów zdrowia.

## Korzyści ruchu

- Poprawa kondycji sercowo-naczyniowej
- Wzmocnienie mięśni i kości
- Lepsza kontrola wagi
- Redukcja stresu
- Poprawa nastroju

## Ile ruchu potrzebujesz?

WHO zaleca:
- 150-300 min aktywności umiarkowanej tygodniowo
- Lub 75-150 min intensywnej aktywności
- Trening siłowy 2x w tygodniu`,
  },
  {
    module: 1,
    categorySlug: 'aktywnosc',
    order: 2,
    title: 'Jak zacząć ćwiczyć?',
    description: 'Praktyczny przewodnik dla początkujących',
    status: 'published',
    contentMd: `# Jak zacząć ćwiczyć?

Nie musisz być sportowcem, aby być aktywnym!

## Krok po kroku

1. **Zacznij powoli** - spacery, stretching
2. **Znajdź coś, co lubisz** - taniec, pływanie, joga
3. **Buduj nawyk** - regularność > intensywność
4. **Słuchaj ciała** - unikaj kontuzji

## Proste pomysły

- 10 min spaceru po obiedzie
- Schody zamiast windy
- Krótkie przerwy na stretching
- Aktywny weekend (rower, nordic walking)`,
  },

  // ===== MODUŁ 2 (PUBLISHED) =====
  // Żywienie (2 materiały)
  {
    module: 2,
    categorySlug: 'zywienie',
    order: 1,
    title: 'Planowanie posiłków',
    description: 'Jak efektywnie planować tygodniowe menu',
    status: 'published',
    contentMd: `# Planowanie posiłków

Planowanie posiłków oszczędza czas, pieniądze i stres.

## Korzyści planowania

- Mniej marnowania jedzenia
- Bardziej zbilansowana dieta
- Oszczędność czasu
- Mniejsze koszty zakupów

## Jak zacząć?

1. Wybierz dzień na planowanie (np. niedziela)
2. Sprawdź, co masz w lodówce
3. Zaplanuj 3-5 dni naprzód
4. Zrób listę zakupów
5. Przygotuj półprodukty (meal prep)`,
  },
  {
    module: 2,
    categorySlug: 'zywienie',
    order: 2,
    title: 'Czytanie etykiet żywieniowych',
    description: 'Jak rozumieć informacje na opakowaniach produktów',
    status: 'published',
    contentMd: `# Czytanie etykiet żywieniowych

Etykiety zawierają cenne informacje o produkcie.

## Na co zwracać uwagę?

- **Skład** - pierwsze składniki to te w największej ilości
- **Wartość odżywcza** - sprawdź na 100g, nie na porcję
- **Cukier** - unikaj produktów z cukrem w pierwszych 3 składnikach
- **Sól** - poniżej 1.5g/100g to dobry wybór
- **Tłuszcz** - rodzaj tłuszczu ma znaczenie

## Pułapki marketingowe

- "Light", "fit", "0%" - sprawdź skład!
- Małe porcje = niska kalорийność
- "Naturalny" nie zawsze = zdrowy`,
  },

  // Psychologia (2 materiały)
  {
    module: 2,
    categorySlug: 'psychologia',
    order: 1,
    title: 'Jedzenie emocjonalne',
    description: 'Jak radzić sobie z emocjonalnym jedzeniem',
    status: 'published',
    contentMd: `# Jedzenie emocjonalne

Jedzenie emocjonalne to sięganie po jedzenie w odpowiedzi na emocje, nie głód.

## Sygnały ostrzegawcze

- Nagły głód (vs. stopniowy fizyczny głód)
- Chęć na konkretne jedzenie
- Jedzenie pomimo sytości
- Poczucie winy po jedzeniu

## Strategie radzenia sobie

1. **Rozpoznaj emocje** - co czujesz?
2. **Znajdź alternatywy** - spacer, rozmowa, hobby
3. **Praktykuj mindfulness** - STOP przed jedzeniem
4. **Bądź dla siebie życzliwy** - bez osądzania`,
  },
  {
    module: 2,
    categorySlug: 'psychologia',
    order: 2,
    title: 'Samoakceptacja i pozytywny obraz ciała',
    description: 'Budowanie zdrowej relacji z własnym ciałem',
    status: 'published',
    contentMd: `# Samoakceptacja i pozytywny obraz ciała

Zdrowie to więcej niż waga na wadze.

## Czym jest pozytywny obraz ciała?

- Akceptacja ciała takim, jakie jest
- Docenienie funkcji ciała, nie tylko wyglądu
- Odporność na nierealną presję mediów
- Skupienie na zdrowiu, nie na wyglądzie

## Jak budować samoakceptację?

1. Ogranicz porównywanie się z innymi
2. Doceniaj swoje ciało za to, co robi
3. Otaczaj się pozytywnymi wzorcami
4. Praktykuj wdzięczność dla ciała
5. Noś ubrania, w których czujesz się dobrze`,
  },

  // Aktywność (2 materiały)
  {
    module: 2,
    categorySlug: 'aktywnosc',
    order: 1,
    title: 'Trening siłowy dla zdrowia',
    description: 'Dlaczego warto włączyć trening siłowy do rutyny',
    status: 'published',
    contentMd: `# Trening siłowy dla zdrowia

Trening siłowy to nie tylko budowanie mięśni - to inwestycja w zdrowie.

## Korzyści treningu siłowego

- Silniejsze kości (zapobieganie osteoporozie)
- Szybszy metabolizm
- Lepsza postawa i równowaga
- Ochrona stawów
- Większa samodzielność w starszym wieku

## Dla początkujących

- Zacznij od ćwiczeń z masą ciała
- 2-3x w tygodniu wystarczy
- Skup się na poprawnej technice
- Stopniowo zwiększaj obciążenie
- Odpoczynek między treningami jest kluczowy`,
  },
  {
    module: 2,
    categorySlug: 'aktywnosc',
    order: 2,
    title: 'Regeneracja i odpoczynek',
    description: 'Rola odpoczynku w aktywnym stylu życia',
    status: 'published',
    contentMd: `# Regeneracja i odpoczynek

Odpoczynek jest równie ważny jak trening.

## Dlaczego regeneracja jest kluczowa?

- Mięśnie rosną podczas odpoczynku, nie treningu
- Zapobiega przetrenowaniu
- Zmniejsza ryzyko kontuzji
- Wspiera system immunologiczny

## Strategie regeneracji

- **Sen** - 7-9 godzin na dobę
- **Aktywna regeneracja** - lekki spacer, yoga
- **Stretching** - po każdym treningu
- **Nawodnienie** - pij wystarczająco wody
- **Odżywianie** - białko i węglowodany po treningu
- **Dzień odpoczynku** - minimum 1-2 w tygodniu`,
  },

  // ===== MODUŁ 3 (PUBLISH_SOON) =====
  {
    module: 3,
    categorySlug: 'zywienie',
    order: 1,
    title: 'Zaawansowane strategie żywieniowe',
    description: 'Optymalizacja diety dla zaawansowanych',
    status: 'publish_soon',
    contentMd: `# Zaawansowane strategie żywieniowe

Wkrótce dostępne - zagłębimy się w zaawansowane tematy żywieniowe.`,
  },
  {
    module: 3,
    categorySlug: 'psychologia',
    order: 1,
    title: 'Utrzymanie zmian długoterminowo',
    description: 'Jak utrzymać zdrowe nawyki przez lata',
    status: 'publish_soon',
    contentMd: `# Utrzymanie zmian długoterminowo

Wkrótce dostępne - strategie budowania trwałych nawyków żywieniowych.`,
  },
  {
    module: 3,
    categorySlug: 'aktywnosc',
    order: 1,
    title: 'Zaawansowane treningi',
    description: 'Programy treningowe dla zaawansowanych',
    status: 'publish_soon',
    contentMd: `# Zaawansowane treningi

Wkrótce dostępne - kompleksowe programy treningowe.`,
  },
]

// ===== FUNKCJA SEED =====
export async function seedPzk(db: Database) {
  console.log('🌱 Starting PZK seed...')

  try {
    // ===== 1. SEED KATEGORII =====
    console.log('📁 Seeding categories...')
    const insertedCategories: Record<string, string> = {}

    for (const category of categories) {
      // Sprawdź czy kategoria już istnieje
      const existing = await db
        .select()
        .from(pzkCategories)
        .where(eq(pzkCategories.slug, category.slug))
        .limit(1)

      if (existing.length > 0) {
        console.log(`  ⏭️  Category "${category.slug}" already exists, skipping`)
        insertedCategories[category.slug] = existing[0].id
      } else {
        const [inserted] = await db.insert(pzkCategories).values(category).returning()
        insertedCategories[category.slug] = inserted.id
        console.log(`  ✅ Created category: ${category.label}`)
      }
    }

    // ===== 2. SEED MATERIAŁÓW =====
    console.log('\n📚 Seeding materials...')
    const insertedMaterials: Array<{ id: string; data: MaterialData }> = []

    for (const materialData of materialsData) {
      const categoryId = insertedCategories[materialData.categorySlug]
      if (!categoryId) {
        console.error(`  ❌ Category "${materialData.categorySlug}" not found, skipping material`)
        continue
      }

      // Sprawdź czy materiał już istnieje (unique: module, category_id, order)
      const existing = await db
        .select()
        .from(pzkMaterials)
        .where(
          and(
            eq(pzkMaterials.module, materialData.module),
            eq(pzkMaterials.categoryId, categoryId),
            eq(pzkMaterials.order, materialData.order)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        console.log(
          `  ⏭️  Material [M${materialData.module}] "${materialData.title}" already exists, skipping`
        )
        insertedMaterials.push({ id: existing[0].id, data: materialData })
      } else {
        const materialToInsert: Omit<NewPzkMaterial, 'id' | 'createdAt' | 'updatedAt'> = {
          module: materialData.module,
          categoryId,
          status: materialData.status,
          order: materialData.order,
          title: materialData.title,
          description: materialData.description,
          contentMd: materialData.contentMd,
        }

        const [inserted] = await db.insert(pzkMaterials).values(materialToInsert).returning()
        insertedMaterials.push({ id: inserted.id, data: materialData })
        console.log(`  ✅ Created material [M${materialData.module}]: ${materialData.title}`)
      }
    }

    // ===== 3. SEED PDF-ÓW =====
    console.log('\n📄 Seeding PDFs...')
    const materialsWithPdf = insertedMaterials.filter((m) => m.data.hasPdf)

    for (const { id: materialId, data } of materialsWithPdf) {
      // Sprawdź czy PDF już istnieje
      const existing = await db
        .select()
        .from(pzkMaterialPdfs)
        .where(
          and(
            eq(pzkMaterialPdfs.materialId, materialId),
            eq(pzkMaterialPdfs.displayOrder, 1)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        console.log(`  ⏭️  PDF for material "${data.title}" already exists, skipping`)
      } else {
        const pdfToInsert: Omit<NewPzkMaterialPdf, 'id' | 'createdAt' | 'updatedAt'> = {
          materialId,
          objectKey: `pzk/module-${data.module}/${materialId}/wprowadzenie.pdf`,
          fileName: 'Wprowadzenie.pdf',
          contentType: 'application/pdf',
          displayOrder: 1,
        }

        await db.insert(pzkMaterialPdfs).values(pdfToInsert)
        console.log(`  ✅ Created PDF for material: ${data.title}`)
      }
    }

    // ===== 4. SEED FILMÓW YOUTUBE =====
    console.log('\n🎥 Seeding YouTube videos...')
    const materialsWithVideo = insertedMaterials.filter((m) => m.data.hasVideo)

    for (const { id: materialId, data } of materialsWithVideo) {
      // Sprawdź czy film już istnieje
      const existing = await db
        .select()
        .from(pzkMaterialVideos)
        .where(
          and(
            eq(pzkMaterialVideos.materialId, materialId),
            eq(pzkMaterialVideos.displayOrder, 1)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        console.log(`  ⏭️  Video for material "${data.title}" already exists, skipping`)
      } else {
        const videoToInsert: Omit<NewPzkMaterialVideo, 'id' | 'createdAt' | 'updatedAt'> = {
          materialId,
          youtubeVideoId: 'lcDEI8RwSDU',
          title: 'Film wprowadzający',
          displayOrder: 1,
        }

        await db.insert(pzkMaterialVideos).values(videoToInsert)
        console.log(`  ✅ Created YouTube video for material: ${data.title}`)
      }
    }

    // ===== 5. SEED DOSTĘPU DO MODUŁU =====
    console.log('\n🔑 Seeding module access...')
    const USER_ID = '219147f7-dc77-424a-9dc0-bee8617ee6b0'
    const MODULE = 1
    const startAt = new Date()
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 12 miesięcy

    // Sprawdź czy dostęp już istnieje
    const existingAccess = await db
      .select()
      .from(pzkModuleAccess)
      .where(
        and(
          eq(pzkModuleAccess.userId, USER_ID),
          eq(pzkModuleAccess.module, MODULE)
        )
      )
      .limit(1)

    if (existingAccess.length > 0) {
      console.log(`  ⏭️  Access for user ${USER_ID} to module ${MODULE} already exists, skipping`)
    } else {
      const accessToInsert: Omit<NewPzkModuleAccess, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: USER_ID,
        module: MODULE,
        startAt,
        expiresAt,
        revokedAt: null,
      }

      await db.insert(pzkModuleAccess).values(accessToInsert)
      console.log(`  ✅ Granted access to module ${MODULE} for user ${USER_ID}`)
      console.log(`     Valid from: ${startAt.toISOString()}`)
      console.log(`     Expires at: ${expiresAt.toISOString()}`)
    }

    console.log('\n✅ PZK seed completed successfully!')
    console.log('\n📊 Summary:')
    console.log(`   - Categories: ${Object.keys(insertedCategories).length}`)
    console.log(`   - Materials: ${insertedMaterials.length}`)
    console.log(`     - Module 1 (published): ${insertedMaterials.filter((m) => m.data.module === 1).length}`)
    console.log(`     - Module 2 (published): ${insertedMaterials.filter((m) => m.data.module === 2).length}`)
    console.log(`     - Module 3 (publish_soon): ${insertedMaterials.filter((m) => m.data.module === 3).length}`)
    console.log(`   - PDFs: ${materialsWithPdf.length}`)
    console.log(`   - YouTube videos: ${materialsWithVideo.length}`)
    console.log(`   - Module access grants: 1`)
  } catch (error) {
    console.error('❌ PZK seed failed:', error)
    throw error
  }
}
