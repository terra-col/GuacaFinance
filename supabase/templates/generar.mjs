// The emails Supabase Auth sends, in Guaca's look: the header of floating cards (the same as the
// login, served by the app at /email/encabezado.png), a white rounded card and the brand's button.
// They are pasted by hand in Supabase → Authentication → Emails → Templates (the Source tab), with
// the subject at the top of each file. Run `node supabase/templates/generar.mjs` after a change.
//
// The links go to /auth/confirm with the token hash, so they work even when the email is opened
// on another device than the one that asked for it.
import { writeFileSync } from "node:fs";

const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "Outfit,'Segoe UI',Helvetica,Arial,sans-serif";
const link = (type, next) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

const button = (href, label) => `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#6d4aff" style="border-radius:999px;background:#6d4aff;background-image:linear-gradient(135deg,#6d4aff 0%,#9a34e6 100%);box-shadow:0 14px 28px -12px rgba(109,74,255,0.75);">
                  <a href="${href}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${label}&nbsp;&rarr;</a>
                </td>
              </tr>
            </table>`;

const code = `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:20px;background:#f1edff;border:1px solid #e2def5;padding:18px 20px 18px 30px;font-family:${DISPLAY};font-size:36px;font-weight:700;letter-spacing:10px;color:#6d4aff;">{{ .Token }}</td>
              </tr>
            </table>`;

function page({ subject, preheader, eyebrow, title, body, action, note }) {
  return `<!-- Asunto: ${subject} -->
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${subject}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f4f2ff;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f2ff" style="background:#f4f2ff;background-image:linear-gradient(160deg,#e9e3ff 0%,#f4f2ff 45%,#fcf0f6 100%);">
    <tr>
      <td align="center" style="padding:32px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:520px;background:#ffffff;border:1px solid #e2def5;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px -24px rgba(30,20,90,0.35);">
          <tr>
            <td style="padding:0;line-height:0;">
              <img src="{{ .SiteURL }}/email/encabezado.png" width="520" alt="Guaca" style="display:block;width:100%;max-width:520px;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:36px 36px 0;font-family:${FONT};">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6d4aff;">${eyebrow}</p>
              <h1 style="margin:0 0 14px;font-family:${DISPLAY};font-size:28px;font-weight:700;line-height:1.15;color:#14112e;">${title}</h1>
              <p style="margin:0;font-size:16px;line-height:1.6;color:#4a4670;">${body}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 0;">${action}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 36px;font-family:${FONT};">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#68648c;">${note}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;background:#f8f6ff;border-top:1px solid #ece8fb;font-family:${FONT};">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#8a86ad;"><strong style="color:#6d4aff;">Guaca</strong> &middot; Tu plata, clara y en movimiento.<br>Este correo se envió a {{ .Email }}.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const TEMPLATES = {
  "confirmar-cuenta": {
    subject: "Confirma tu cuenta en Guaca",
    preheader: "Un toque y entras a ver tus cuentas, pagos y metas.",
    eyebrow: "Bienvenida",
    title: "Confirma tu correo y entra",
    body: "Ya casi. Toca el botón para confirmar tu correo: entras directo a Guaca y empiezas por agregar tus cuentas.",
    action: button(link("email", "/"), "Confirmar mi correo"),
    note: "El enlace sirve una sola vez. Si no creaste una cuenta en Guaca, ignora este correo.",
  },
  "cambiar-contrasena": {
    subject: "Cambia tu contraseña de Guaca",
    preheader: "Elige una contraseña nueva para tu cuenta.",
    eyebrow: "Tu cuenta",
    title: "Elige una contraseña nueva",
    body: "Recibimos una solicitud para cambiar la contraseña de tu cuenta. Toca el botón y escribe la nueva.",
    action: button(link("recovery", "/nueva-clave"), "Elegir contraseña"),
    note: "Si no lo pediste, ignora este correo: tu contraseña sigue igual.",
  },
  invitacion: {
    subject: "Te invitaron a Guaca",
    preheader: "Lo que tienes, lo que debes y lo que pagas este mes, en un solo lugar.",
    eyebrow: "Invitación",
    title: "Te invitaron a Guaca",
    body: "Guaca te ayuda a ver en un solo lugar lo que tienes, lo que debes y lo que vas a pagar este mes. Acepta la invitación y elige tu contraseña.",
    action: button(link("invite", "/nueva-clave"), "Aceptar invitación"),
    note: "Cada persona ve solo sus propios datos. Si no esperabas esta invitación, ignora este correo.",
  },
  "enlace-magico": {
    subject: "Tu enlace para entrar a Guaca",
    preheader: "Entra sin contraseña con un toque.",
    eyebrow: "Entrar",
    title: "Tu enlace para entrar",
    body: "Toca el botón para entrar a Guaca sin escribir la contraseña.",
    action: button(link("email", "/"), "Entrar a Guaca"),
    note: "El enlace sirve una sola vez. Si no intentaste entrar, ignora este correo: nadie puede usar tu cuenta sin él.",
  },
  "cambiar-correo": {
    subject: "Confirma tu nuevo correo en Guaca",
    preheader: "Confirma el cambio de correo de tu cuenta.",
    eyebrow: "Tu cuenta",
    title: "Confirma tu nuevo correo",
    body: "Pediste cambiar el correo de tu cuenta de <strong style=\"color:#14112e;\">{{ .Email }}</strong> a <strong style=\"color:#14112e;\">{{ .NewEmail }}</strong>. Toca el botón para confirmarlo.",
    action: button(link("email_change", "/ajustes"), "Confirmar nuevo correo"),
    note: "Si no lo pediste, ignora este correo y tu cuenta seguirá con el correo actual.",
  },
  verificacion: {
    subject: "Tu código de verificación de Guaca",
    preheader: "Tu código para confirmar que eres tú.",
    eyebrow: "Verificación",
    title: "Confirma que eres tú",
    body: "Escribe este código en Guaca para continuar:",
    action: code,
    note: "Si no lo pediste, ignora este correo y considera cambiar tu contraseña.",
  },
};

for (const [name, template] of Object.entries(TEMPLATES)) {
  writeFileSync(new URL(`./${name}.html`, import.meta.url), page(template));
}
console.log(`${Object.keys(TEMPLATES).length} plantillas`);
