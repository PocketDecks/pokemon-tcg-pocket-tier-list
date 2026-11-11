import { describe, expect, it } from "vitest";

type PremiumCopy = { premium: { codeError: string } };

const locales = import.meta.glob<PremiumCopy>("../*_translation.json", {
  eager: true,
  import: "default",
});

const localeName = (path: string) =>
  path.replace(/^.*\//, "").replace("_translation.json", "");

const PAYER_EMAIL: Record<string, string> = {
  en: "as the payer email at Ko-fi checkout",
  de: "als E-Mail-Adresse für die Zahlung beim Ko-fi-Checkout",
  es: "como correo de pago en Ko-fi",
  fr: "comme adresse e-mail de paiement",
  it: "come indirizzo e-mail di pagamento",
  ja: "Ko-fiの支払い時のメールアドレスとして",
  ko: "Ko-fi 결제 시 이메일 주소로",
  pt: "como e-mail de pagamento no Ko-fi",
  ro: "ca adresă de e-mail pentru plată pe Ko-fi",
  "zh-CN": "用作 Ko-fi 结账时的付款邮箱",
  "zh-TW": "用作 Ko-fi 結帳時的付款電子郵件",
};

const MESSAGE_NOT_READ: Record<string, string> = {
  en: "is not read",
  de: "wird nicht gelesen",
  es: "No leemos",
  fr: "n’est pas lue",
  it: "non viene letto",
  ja: "読み取られません",
  ko: "읽지 않습니다",
  pt: "não é lido",
  ro: "nu este citită",
  "zh-CN": "不会被读取",
  "zh-TW": "不會被讀取",
};

const CONTACT_SUPPORT: Record<string, string> = {
  en: "contact us using the address below",
  de: "kontaktiere uns über die untenstehende Adresse",
  es: "escríbenos a la dirección que aparece abajo",
  fr: "contactez-nous à l’adresse ci-dessous",
  it: "contattaci all’indirizzo qui sotto",
  ja: "下記の連絡先までご連絡ください",
  ko: "아래 연락처로 문의해 주세요",
  pt: "contacte-nos através do endereço abaixo",
  ro: "contactează-ne la adresa de mai jos",
  "zh-CN": "请通过下方联系方式与我们联系",
  "zh-TW": "請透過下方聯絡方式與我們聯繫",
};

describe("premium.codeError", () => {
  it("covers all 11 interface locales", () => {
    expect(Object.keys(locales)).toHaveLength(11);
    expect(Object.keys(PAYER_EMAIL).sort()).toEqual(Object.keys(locales).map(localeName).sort());
  });

  it.each(Object.entries(locales))(
    "%s points at the payer email, not an email written in the message",
    (path, data) => {
      const locale = localeName(path);
      const copy = data.premium.codeError;
      expect(copy).toContain(PAYER_EMAIL[locale]);
      expect(copy).toContain(MESSAGE_NOT_READ[locale]);
      expect(copy).toContain(CONTACT_SUPPORT[locale]);
      expect(copy).not.toContain("<0/>");
      expect(copy).not.toContain("{{");
    }
  );

  it("matches the English copy rendered through the app", () => {
    const english = Object.entries(locales).find(([path]) => localeName(path) === "en");
    expect(english?.[1].premium.codeError).not.toMatch(/in your Ko-fi message/);
  });
});
