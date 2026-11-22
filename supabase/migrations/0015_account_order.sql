-- El orden de las tarjetas en cada carrusel (cuentas, tarjetas de crédito, préstamos), elegido
-- manteniendo oprimida una y moviéndola. Vacío = al final, por fecha de creación. La favorita
-- para pagos va siempre de primera, sin importar su posición.

alter table public.accounts
  add column position integer check (position >= 0);
