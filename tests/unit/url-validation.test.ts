/**
 * Upload URL validation.
 *
 * This is a security control, not a formatting nicety. Every URL it guards is
 * stored and later rendered as an <a href> in the admin panel, so a
 * `javascript:` link here is code execution in an administrator's session.
 *
 * z.string().url() accepts every dangerous case below, which is exactly why
 * this module exists.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { isSafeUploadUrl, uploadedFileUrl, uploadedFileUrls } from "@/lib/validation/urls";

const CLOUDINARY = "https://res.cloudinary.com/demo/image/upload/v1/proof.jpg";

describe("dangerous schemes", () => {
  const attacks = [
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "http://res.cloudinary.com/demo/image/upload/v1/p.jpg", // plain http
  ];

  for (const attack of attacks) {
    it(`rejects ${attack.slice(0, 40)}`, () => {
      expect(isSafeUploadUrl(attack)).toBe(false);
      expect(uploadedFileUrl.safeParse(attack).success).toBe(false);
    });
  }

  it("is a genuine improvement on z.string().url()", () => {
    // The bug this module fixes: zod happily accepts these.
    for (const attack of ["javascript:alert(1)", "data:text/html,<b>x</b>"]) {
      expect(z.string().url().safeParse(attack).success).toBe(true);
      expect(uploadedFileUrl.safeParse(attack).success).toBe(false);
    }
  });
});

describe("host confusion", () => {
  const attacks = [
    "https://res.cloudinary.com.evil.test/p.jpg",
    "https://evil.test/res.cloudinary.com/p.jpg",
    "https://res.cloudinary.com@evil.test/p.jpg",
    "https://user:pass@res.cloudinary.com/demo/p.jpg",
    "https://notres.cloudinary.com/p.jpg",
    "//res.cloudinary.com/demo/p.jpg",
  ];

  for (const attack of attacks) {
    it(`rejects ${attack}`, () => {
      expect(isSafeUploadUrl(attack)).toBe(false);
    });
  }
});

describe("malformed input", () => {
  for (const value of ["", "   ", "not a url", "://missing-scheme", "https://"]) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      expect(isSafeUploadUrl(value)).toBe(false);
    });
  }
});

describe("genuine uploads", () => {
  it("accepts a Cloudinary secure_url", () => {
    expect(isSafeUploadUrl(CLOUDINARY)).toBe(true);
    expect(uploadedFileUrl.safeParse(CLOUDINARY).success).toBe(true);
  });

  it("accepts one carrying transformations", () => {
    expect(
      isSafeUploadUrl(
        "https://res.cloudinary.com/demo/image/upload/f_auto,w_640/v1/proof.jpg",
      ),
    ).toBe(true);
  });

  it("accepts a PDF proof", () => {
    expect(
      isSafeUploadUrl("https://res.cloudinary.com/demo/raw/upload/v1/receipt.pdf"),
    ).toBe(true);
  });
});

describe("lists", () => {
  it("accepts a list of real uploads", () => {
    expect(uploadedFileUrls(5).safeParse([CLOUDINARY, CLOUDINARY]).success).toBe(true);
  });

  it("rejects a list containing one poisoned entry", () => {
    const result = uploadedFileUrls(5).safeParse([
      CLOUDINARY,
      "javascript:alert(1)",
    ]);
    expect(result.success).toBe(false);
  });

  it("enforces the cap", () => {
    const many = Array.from({ length: 6 }, () => CLOUDINARY);
    expect(uploadedFileUrls(5).safeParse(many).success).toBe(false);
  });
});
