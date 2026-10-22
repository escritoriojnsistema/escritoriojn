import { test, expect, type Page } from "@playwright/test";
test.skip(!process.env.TEAM_UI_CONTRACT, "Fictitious UI contract.");
const office = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const permissions = [
  "foundation.access",
  "requests.read",
  "charges.read",
  "charges.create",
  "charges.adjust",
  "charges.cancel",
];
const data = { protocol: "JN-2026-000013" };
const view = {
  request_id: id,
  protocol: data.protocol,
  closed: false,
  following_only: false,
  can_create: true,
  items: [
    {
      request_item_id: id,
      name: "Serviço A",
      quantity: "1",
      unit_price_cents: 6000,
      total_cents: 6000,
      adjustment: { kind: "none", value: 0, reason: "" },
    },
    {
      request_item_id: office,
      name: "Serviço B",
      quantity: "1",
      unit_price_cents: 4000,
      total_cents: 4000,
      adjustment: { kind: "none", value: 0, reason: "" },
    },
  ],
  charge: null,
};
const charge = {
  id,
  version: 1,
  currency: "BRL",
  status: "aberta",
  original_cents: 10000,
  due_cents: 10000,
  allocated_cents: 0,
  balance_cents: 10000,
  can_adjust: true,
  can_discount: true,
  can_surcharge: true,
  can_cancel: true,
  installments: [{ number: 1, due_date: "2026-10-22", amount_cents: 10000 }],
  history: [],
  history_page: 1,
  history_total: 0,
};
async function setup(page: Page, { empty = false, client = false } = {}) {
  const token = `e30.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", session_id: office })).toString("base64url")}.fixture`;
  await page.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        "sb-team-ui-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: user,
            aud: "authenticated",
            email: "fixture@example.test",
            app_metadata: {},
            user_metadata: {},
          },
        }),
      ),
    { token, user },
  );
  await page.route("https://team-ui.supabase.co/**", (r) =>
    r.fulfill({ json: { id: user, aud: "authenticated" } }),
  );
  await page.route("**/api/notifications/summary", (r) =>
    r.fulfill({ json: { data: { unread: 0 } } }),
  );
  await page.route("**/api/auth/context", (r) =>
    r.fulfill({
      json: {
        data: {
          user: { id: user },
          contexts: [
            {
              office_id: office,
              user_id: user,
              role_code: client ? "client" : "owner",
              permissions,
              office_name: "Escritório Fictício",
              display_name: "Pessoa Fictícia",
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/requests/search", (r) =>
    r.fulfill({
      json: {
        data: {
          items: empty
            ? []
            : [{ id, protocol: data.protocol, title: "Solicitação fictícia" }],
          total: empty ? 0 : 1,
          page: 1,
          page_size: 3,
          portal: false,
        },
      },
    }),
  );

  await page.route("**/api/charges/**", (r) =>
    r.fulfill({ json: { data: view } }),
  );
}

for (const width of [320, 360, 768, 1440, 1920])
  test(`charges workspace ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 360 ? 640 : 900 });
    await setup(page);
    await page.goto("/cobrancas");
    await page
      .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cobranças", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Serviço A", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Valor da parcela 1")).toHaveValue("100.00");
    await page.route("**/api/charges/create", (r) =>
      r.fulfill({ json: { data: { ...view, charge } } }),
    );
    await page
      .getByRole("button", { name: "Registrar cobrança", exact: true })
      .click();
    await expect(
      page.getByText("Saldo em aberto", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
    if (width === 360) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const summary = page
        .locator("summary")
        .filter({ hasText: "Histórico da cobrança" });
      const box = await summary.boundingBox();
      const nav = await page
        .getByRole("navigation", { name: "Atalhos do aplicativo" })
        .boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
      for (const target of await page.locator(".charges-main summary").all()) {
        expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (process.env.CHARGES_UI_CAPTURE) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `docs/evidencias/etapa-13/cobrancas-${width}.png`,
        fullPage: true,
      });
    }
    if (width < 900)
      expect(
        await page
          .getByRole("navigation", { name: "Atalhos do aplicativo" })
          .getByRole("link")
          .count(),
      ).toBeLessThanOrEqual(4);
  });
test("charges empty list", async ({ page }) => {
  await setup(page, { empty: true });
  await page.goto("/cobrancas");
  await expect(page.getByText(/Nenhuma solicitação disponível/)).toBeVisible();
});
test("retry retains exact command after lost response", async ({ page }) => {
  await setup(page);
  let bodies: any[] = [];
  await page.route("**/api/charges/create", (r) => {
    bodies.push(r.request().postDataJSON());
    return bodies.length === 1
      ? r.abort()
      : r.fulfill({ json: { data: { ...view, charge } } });
  });
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page
    .getByRole("button", { name: "Registrar cobrança", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar cobrança", exact: true })
    .click();
  await expect(
    page.getByText("Saldo em aberto", { exact: true }),
  ).toBeVisible();
  expect(bodies[0]).toEqual(bodies[1]);
});
test("404 clears private detail and draft", async ({ page }) => {
  await setup(page);
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await expect(page.getByText("Serviço A", { exact: false })).toBeVisible();
  await page.route("**/api/charges/view", (r) =>
    r.fulfill({ status: 404, json: { error: { code: "REQUEST_NOT_FOUND" } } }),
  );
  await page.getByRole("button", { name: "Atualizar cobrança" }).click();
  await expect(page.getByText("Serviço A", { exact: false })).toHaveCount(0);
});
test("adjust and cancel preserve explicit decision and versions", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/charges/view", (r) =>
    r.fulfill({ json: { data: { ...view, charge } } }),
  );
  let body: any;
  await page.route("**/api/charges/mutate", (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({
      json: {
        data: {
          ...view,
          charge: {
            ...charge,
            version: charge.version + 1,
            due_cents: body.mutation.kind === "adjust" ? 9000 : 0,
            balance_cents: body.mutation.kind === "adjust" ? 9000 : 0,
            status: body.mutation.kind === "adjust" ? "aberta" : "cancelada",
          },
        },
      },
    });
  });
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page.getByText("Ajustar obrigação", { exact: true }).click();
  await page.getByLabel("Valor do ajuste").fill("10,00");
  await page.getByLabel("Motivo do ajuste").fill("Desconto autorizado");
  await page.getByLabel("Valor da parcela 1").fill("90,00");
  await page
    .getByRole("button", { name: "Registrar ajuste", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(body.expected_version).toBe(1);
  expect(body.mutation.delta_cents).toBe(-1000);
  expect(body.mutation.installments[0].amount_cents).toBe(9000);
  await page.getByText("Cancelar cobrança", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmar cancelamento" }),
  ).toBeDisabled();
  await page
    .getByLabel("Motivo do cancelamento")
    .fill("Cancelamento autorizado");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByText(/Estado: cancelada/)).toBeVisible();
  expect(body.expected_version).toBe(2);
  expect(body.mutation.kind).toBe("cancel");
});
test("installment exact sum and dates enforced before sending", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page.getByLabel("Quantidade de parcelas").selectOption("3");
  const amounts = await page
    .getByLabel(/Valor da parcela/)
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value),
    );
  expect(amounts).toEqual(["33.34", "33.33", "33.33"]);
  await page.getByLabel("Valor da parcela 2").fill("10");
  await page
    .getByRole("button", { name: "Registrar cobrança", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("soma exata");
});
test("forged client capabilities never open financial module", async ({
  page,
}) => {
  await setup(page, { client: true });
  await page.goto("/cobrancas");
  await expect(page.getByRole("heading", { name: /Acesso/ })).toBeVisible();
  await expect(page.getByText("Serviço A", { exact: false })).toHaveCount(0);
});
test("current authority forbids discount even when adjust allowed", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/charges/view", (r) =>
    r.fulfill({
      json: { data: { ...view, charge: { ...charge, can_discount: false } } },
    }),
  );
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page.getByText("Ajustar obrigação", { exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Desconto", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Direção do ajuste" }),
  ).toHaveValue("surcharge");
});
test("403 on revalidation clears financial detail and blocks picker", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await expect(page.getByText("Serviço A", { exact: false })).toBeVisible();
  await page.route("**/api/charges/view", (r) =>
    r.fulfill({ status: 403, json: { error: { code: "CHARGES_FORBIDDEN" } } }),
  );
  await page.getByRole("button", { name: "Atualizar cobrança" }).click();
  await expect(page.getByText("Serviço A", { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Verificar acesso" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selecionar atendimento" }),
  ).toHaveCount(0);
});
test("pending command keeps label and rejects stale background view", async ({
  page,
}) => {
  await setup(page);
  let count = 0;
  let release!: () => void;
  const barrier = new Promise<void>((r) => (release = r));
  await page.route("**/api/charges/view", async (r) => {
    count++;
    if (count === 2) await barrier;
    await r.fulfill({ json: { data: view } });
  });
  let finish!: () => void;
  const mutation = new Promise<void>((r) => (finish = r));
  await page.route("**/api/charges/create", async (r) => {
    await mutation;
    await r.fulfill({ json: { data: { ...view, charge } } });
  });
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await expect(page.getByText("Serviço A", { exact: false })).toBeVisible();
  const query = page.waitForRequest("**/api/charges/view");
  await page.getByRole("button", { name: "Atualizar cobrança" }).click();
  await query;
  await page
    .getByRole("button", { name: "Registrar cobrança", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Registrar cobrança", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
  finish();
  await expect(
    page.getByText("Saldo em aberto", { exact: true }),
  ).toBeVisible();
  const stale = page.waitForResponse("**/api/charges/view");
  release();
  await stale;
  await expect(
    page.getByText("Saldo em aberto", { exact: true }),
  ).toBeVisible();
});
test("same session focus preserves draft; revoked authority discards workspace", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page.getByLabel("Valor da parcela 1").fill("42,00");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Valor da parcela 1")).toHaveValue("42,00");
  await page.route("**/api/auth/context", (r) =>
    r.fulfill({
      json: {
        data: {
          user: { id: user },
          contexts: [
            {
              office_id: office,
              user_id: user,
              role_code: "owner",
              permissions: ["foundation.access", "requests.read"],
              office_name: "Escritório Fictício",
              display_name: "Pessoa Fictícia",
            },
          ],
        },
      },
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("Valor da parcela 1")).toHaveCount(0);
  await expect(page.getByText("Serviço A", { exact: false })).toHaveCount(0);
});
test("history requests explicit pages of five", async ({ page }) => {
  await setup(page);
  const pages: number[] = [];
  await page.route("**/api/charges/view", (r) => {
    const p = r.request().postDataJSON().history_page;
    pages.push(p);
    return r.fulfill({
      json: {
        data: {
          ...view,
          charge: {
            ...charge,
            history_page: p,
            history_total: 6,
            history: [
              {
                id,
                kind: "created",
                delta_cents: 10000,
                reason: `Evento página ${p}`,
                actor_name: "Pessoa",
                created_at: "2026-10-22T10:00:00Z",
                version: 1,
              },
            ],
          },
        },
      },
    });
  });
  await page.goto("/cobrancas");
  await page
    .getByRole("button", { name: "Escolher solicitação JN-2026-000013" })
    .click();
  await page.getByText("Histórico da cobrança", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Histórico da cobrança" })
    .getByRole("button", { name: "Próxima" })
    .click();
  await expect(page.getByText(/Evento página 2/)).toBeVisible();
  expect(pages).toEqual([1, 2]);
});
