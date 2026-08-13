/**
 * /owner/onboarding — Owner setup checklist
 *
 * Four steps, matching CarOwnerProfile.onboardingStep:
 *   1 Profile   2 Payout details   3 Subscription   4 First car
 *
 * Completion is derived from the data itself, not from a counter that can
 * drift — `onboardingStep` is a hint for where to resume, not the source of
 * truth for what's done.
 */

import { redirect } from "next/navigation";
import { loginPath } from "@/lib/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { routes } from "@/lib/routes";
import { Check, CircleDot, Lock, ArrowRight } from "lucide-react";

export const metadata = { title: "Set up your owner account — ZuriDrive" };

export default async function OwnerOnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/owner/onboarding"));

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      phone: true,
      carOwnerProfile: {
        select: {
          id: true,
          momoNumber: true,
          bankAccountNumber: true,
          isOnboardingComplete: true,
          _count: { select: { cars: true, subscriptions: true } },
        },
      },
    },
  });

  const profile = user.carOwnerProfile;

  // Derive each step from the data rather than trusting a stored counter.
  const steps = [
    {
      n: 1,
      title: "Your profile",
      description: "Your name and contact details, so renters know who they're dealing with.",
      href: routes.ownerProfile,
      done: Boolean(user.name && user.phone),
    },
    {
      n: 2,
      title: "Payout details",
      description: "Where we send your earnings — MoMo number or bank account.",
      href: routes.ownerProfile,
      done: Boolean(profile?.momoNumber || profile?.bankAccountNumber),
    },
    {
      n: 3,
      title: "Choose a plan",
      description: "Pick the subscription tier that matches your fleet size.",
      href: routes.ownerSubscription,
      done: (profile?._count.subscriptions ?? 0) > 0,
    },
    {
      n: 4,
      title: "List your first car",
      description: "Photos, pricing and availability. Takes about five minutes.",
      href: routes.ownerFleetNew,
      done: (profile?._count.cars ?? 0) > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  // The first incomplete step is the only one that's actionable.
  const currentStep = steps.find((s) => !s.done)?.n ?? steps.length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">
          {allDone ? "You're all set" : "Finish setting up"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {allDone
            ? "Your account is complete. Your listings can go live once an admin approves them."
            : "Complete these four steps to start renting out your cars."}
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">Progress</span>
          <span className="text-ink-soft">
            {completedCount} of {steps.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((step) => {
          const isCurrent = !step.done && step.n === currentStep;
          const isLocked = !step.done && step.n !== currentStep;

          return (
            <li key={step.n}>
              <div
                className={`rounded-2xl bg-white p-4 shadow-sm ${
                  isCurrent ? "ring-2 ring-brand" : ""
                } ${isLocked ? "opacity-60" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.done
                        ? "bg-brand text-white"
                        : isCurrent
                          ? "bg-accent text-white"
                          : "bg-sand text-ink-faint"
                    }`}
                  >
                    {step.done ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <CircleDot className="h-4 w-4" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-ink">
                      {step.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {step.description}
                    </p>

                    {(step.done || isCurrent) && (
                      <Link
                        href={step.href}
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          isCurrent
                            ? "bg-brand text-white hover:bg-brand-dark"
                            : "border border-sand-dark text-ink-muted hover:border-brand hover:text-brand"
                        }`}
                      >
                        {step.done ? "Review" : "Continue"}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {allDone && (
        <Link
          href={routes.ownerDashboard}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Go to your dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
