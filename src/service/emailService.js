import nodemailer from 'nodemailer';

// Brevo SMTP — credenciales en .env
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,   // tu email de cuenta Brevo
    pass: process.env.BREVO_SMTP_PASS,   // SMTP key de Brevo (no la API key)
  },
});

export async function sendWelcomeEmail(email, nombre, password, empresaNombre = '') {
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Insignia Conecta'}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: 'Bienvenido a Insignia Conecta - Tus credenciales de acceso',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1a1a1a;">Bienvenido, ${nombre}</h2>
        ${empresaNombre
          ? `<p style="color: #555;">Has sido agregado al equipo de <strong>${empresaNombre}</strong> en Insignia Conecta.</p>`
          : ''}
        <p style="color: #555;">Tus credenciales de acceso son:</p>
        <div style="background: #f4f4f4; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #6366f1;">
          <p style="margin: 6px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 6px 0;"><strong>Contraseña:</strong>
            <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px;">${password}</code>
          </p>
        </div>
        <p style="color: #888; font-size: 13px;">
          Por seguridad, te recomendamos cambiar tu contraseña al iniciar sesión por primera vez.
        </p>
        <a href="${process.env.FRONTEND_URL || '#'}"
           style="display:inline-block; margin-top:16px; padding:10px 20px;
                  background:#6366f1; color:#fff; border-radius:6px; text-decoration:none;">
          Iniciar sesión
        </a>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] Bienvenida enviada a: ${email} (ID: ${info.messageId})`);
}
