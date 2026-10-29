import { describeRemoved, screenText } from "./fn/_shared/redact.ts";
let fails = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + n + (extra ? "  :: " + extra : "")); if (!ok) fails++; };
const s = screenText;

// things that must be kept out
check("OTP message is skipped", s("Your verification code is 482913. Do not share it.").skip);
check("short 'otp 1234' skipped", s("OTP: 1234").skip);
check("private key skipped", s("-----BEGIN RSA PRIVATE KEY-----\nabc").skip);
check("valid card number masked", s("my visa is 4111 1111 1111 1111 thanks").text === "my visa is [card number removed] thanks");
check("card with dashes masked", s("4242-4242-4242-4242").text === "[card number removed]");
check("password value masked", s("wifi password: Hunter2!x ok").text === "wifi password: [removed] ok");
check("pin is masked", s("my pin is 4821").text === "my pin is [removed]");
check("api key shape masked", !s("key sk_live_abcdefghijklmnop1234 here").text.includes("sk_live"));
check("aws key masked", !s("AKIAABCDEFGHIJKLMNOP").text.includes("AKIA"));
check("jwt masked", !s("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk1234567").text.includes("eyJ"));
check("labelled BVN masked", s("my bvn is 22123456789").text === "my bvn is [removed]");
check("labelled SSN masked", s("SSN: 123-45-6789").text === "SSN: [removed]");
check("seed phrase masked", s("seed phrase: apple banana cherry donkey eagle flower garden hammer island jacket kitten lemon").text === "seed phrase: [removed]");
check("reports what was removed", s("4111 1111 1111 1111 and password: abc12345").removed.length === 2);
check("describeRemoved joins", describeRemoved(["a card number", "a password or secret"]) === "a card number and a password or secret");

// things that must be left alone (false positives hurt a memory app)
const keep = (label: string, t: string) => { const r = s(t); check("keeps: " + label, !r.skip && r.text === t, r.text); };
keep("friend's account number", "Tunde's GTBank account number is 0123456789, pay him 5k on Friday");
keep("order number", "Order 123456789012 shipped via DHL");
keep("phone number", "Call Amaka on 0803 123 4567 tomorrow");
keep("invalid Luhn long number", "ticket ref 4111 1111 1111 1112");
keep("password manager talk", "I should look at a password manager, 1Password maybe");
keep("pin the post", "pin the post about launch on the page");
keep("code review (no otp)", "Send the code review notes to Sam by 5pm");
keep("long text that mentions a code", "The verification code feature should send a six digit code to users when they sign up, and we need to design the email template, the expiry logic, the retry limits, and the rate limiting. We should write the spec this week and share it with the team on Monday for 1234 feedback.");
keep("plain note", "Remember to call mum tomorrow at 9");
keep("empty", "");

console.log(fails ? `\n${fails} FAILED` : "\nall redaction tests passed");
Deno.exit(fails ? 1 : 0);
