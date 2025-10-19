import type { APIRoute } from 'astro';
import sgMail from '@sendgrid/mail';
import { consultationSchema } from '../../schemas/consultation';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Parse request body
    const body = await request.json();

    // Validate with Zod
    const validatedData = consultationSchema.parse(body);

    // Configure SendGrid
    const apiKey = import.meta.env.SENDGRID_API_KEY;
    const contactEmail = import.meta.env.CONTACT_EMAIL || 'dietoterapia@paulinamaciak.pl';
    const siteUrl = import.meta.env.SITE_URL || 'https://paulinamaciak.pl';

    if (!apiKey) {
      console.error('SENDGRID_API_KEY is not configured');
      // In development, just log and return success
      if (import.meta.env.DEV) {
        console.log('📧 [DEV MODE] Email would be sent with data:', validatedData);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'DEV MODE: Email logged to console',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Email service not configured');
    }

    sgMail.setApiKey(apiKey);

    const { consultationType, fullName, email, phone, preferredDate, additionalInfo } = validatedData;

    // Extract first name for personalization
    const firstName = fullName.split(' ')[0];

    // Consultation type labels
    const consultationLabels: Record<string, string> = {
      diagnostyczna: 'Konsultacja diagnostyczna',
      kontrolna: 'Konsultacja kontrolna',
      kompleksowa: 'Konsultacja kompleksowa',
    };

    const consultationLabel = consultationLabels[consultationType] || consultationType;

    // Email to Paulina (owner)
    const ownerEmail = {
      to: contactEmail,
      from: contactEmail,
      subject: `Nowe zapytanie o konsultację: ${consultationLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4A7C59; border-bottom: 2px solid #4A7C59; padding-bottom: 10px;">
            Nowe zapytanie o konsultację
          </h2>

          <div style="background-color: #F9F6F3; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Typ konsultacji:</strong>
              <span style="color: #F4A460; font-weight: bold;">${consultationLabel}</span>
            </p>
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Imię i nazwisko:</strong> ${fullName}
            </p>
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Email:</strong>
              <a href="mailto:${email}" style="color: #4A7C59;">${email}</a>
            </p>
            <p style="margin: 10px 0;">
              <strong style="color: #2C3E3A;">Telefon:</strong>
              <a href="tel:${phone}" style="color: #4A7C59;">${phone}</a>
            </p>
          </div>

          ${preferredDate ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #4A7C59; margin-bottom: 10px;">Preferowany termin:</h3>
              <p style="background-color: #F9F6F3; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${preferredDate}</p>
            </div>
          ` : ''}

          ${additionalInfo ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #4A7C59; margin-bottom: 10px;">Dodatkowe informacje:</h3>
              <p style="background-color: #F9F6F3; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${additionalInfo}</p>
            </div>
          ` : ''}

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E8B4A8;">
            <p style="color: #666; font-size: 14px;">
              <strong>Data wysłania:</strong> ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}
            </p>
          </div>
        </div>
      `,
    };

    // Confirmation email to user
    const userEmail = {
      to: email,
      from: contactEmail,
      subject: 'Potwierdzenie wysłania zapytania - Dietoterapia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4A7C59; border-bottom: 2px solid #4A7C59; padding-bottom: 10px;">
            Dziękujemy za zapytanie!
          </h2>

          <p style="font-size: 16px; color: #2C3E3A; margin: 20px 0;">
            Cześć <strong>${firstName}</strong>,
          </p>

          <p style="font-size: 16px; color: #2C3E3A; line-height: 1.6;">
            Twoje zapytanie o <strong style="color: #F4A460;">${consultationLabel}</strong> zostało wysłane pomyślnie.
          </p>

          <p style="font-size: 16px; color: #2C3E3A; line-height: 1.6;">
            Paulina skontaktuje się z Tobą w ciągu <strong>24 godzin</strong>, aby umówić szczegóły konsultacji.
          </p>

          <hr style="border: none; border-top: 1px solid #E8B4A8; margin: 30px 0;" />

          <div style="background-color: #F9F6F3; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #4A7C59; margin-top: 0;">Dane kontaktowe:</h3>
            <p style="margin: 10px 0;">
              <strong>Email:</strong>
              <a href="mailto:dietoterapia@paulinamaciak.pl" style="color: #4A7C59;">dietoterapia@paulinamaciak.pl</a>
            </p>
            <p style="margin: 10px 0;">
              <strong>Telefon:</strong>
              <a href="tel:+48518036686" style="color: #4A7C59;">+48 518 036 686</a>
            </p>
            <p style="margin: 10px 0;">
              <strong>Strona:</strong>
              <a href="${siteUrl}" style="color: #4A7C59;">${siteUrl.replace('https://', '')}</a>
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E8B4A8; text-align: center;">
            <p style="color: #666; font-size: 14px; margin: 5px 0;">
              Paulina Maciak - Dietetyk kliniczna
            </p>
          </div>
        </div>
      `,
    };

    // Send both emails
    await sgMail.send(ownerEmail);
    await sgMail.send(userEmail);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Zapytanie zostało wysłane pomyślnie',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing consultation request:', error);

    // Zod validation error
    if (error.errors) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Dane formularza są nieprawidłowe',
          details: error.errors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Other errors
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Wystąpił błąd podczas przetwarzania zapytania',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
