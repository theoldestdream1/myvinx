/**
 * Small adapter so the original Vinx screens (written for react-router) run on
 * TanStack Router without rewriting every call site.
 */
import {
  Link as TsLink,
  useLocation as useTsLocation,
  useRouter,
} from "@tanstack/react-router";
import { forwardRef, useCallback, useEffect, useMemo, type AnchorHTMLAttributes, type ReactNode } from "react";

type To = string;

function splitTo(to: To) {
  const [pathAndSearch = "", hash] = to.split("#");
  const [pathname = "/", search] = pathAndSearch.split("?");
  return { pathname: pathname || "/", search: search ? `?${search}` : "", hash: hash ? `#${hash}` : "" };
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: To | number, opts?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      const { pathname, search, hash } = splitTo(to);
      const href = `${pathname}${search}${hash}`;
      if (opts?.replace) router.history.replace(href, opts?.state as never);
      else router.history.push(href, opts?.state as never);
    },
    [router],
  );
}

export function useLocation() {
  const loc = useTsLocation();
  return {
    pathname: loc.pathname,
    search: loc.searchStr ?? "",
    hash: loc.hash ? `#${loc.hash}` : "",
    state: (loc.state ?? null) as unknown,
    key: (loc.state as { key?: string } | undefined)?.key ?? "default",
  };
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>, opts?: { replace?: boolean }) => void] {
  const loc = useTsLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(loc.searchStr ?? ""), [loc.searchStr]);
  const set = useCallback(
    (next: URLSearchParams | Record<string, string>, opts?: { replace?: boolean }) => {
      const sp = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const qs = sp.toString();
      navigate(`${loc.pathname}${qs ? `?${qs}` : ""}`, { replace: opts?.replace });
    },
    [loc.pathname, navigate],
  );
  return [params, set];
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: To;
  replace?: boolean;
  children?: ReactNode;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ to, replace, ...rest }, ref) => {
  const { pathname, search, hash } = splitTo(to);
  return (
    <TsLink
      ref={ref}
      to={pathname as never}
      search={(search ? Object.fromEntries(new URLSearchParams(search)) : undefined) as never}
      hash={hash ? hash.slice(1) : undefined}
      replace={replace}
      {...(rest as object)}
    />
  );
});
Link.displayName = "Link";

type NavLinkProps = Omit<LinkProps, "className" | "children"> & {
  className?: string | ((s: { isActive: boolean; isPending: boolean }) => string | undefined);
  children?: ReactNode | ((s: { isActive: boolean; isPending: boolean }) => ReactNode);
  end?: boolean;
};

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(({ to, className, children, end, ...rest }, ref) => {
  const loc = useTsLocation();
  const target = splitTo(to).pathname;
  const isActive = end || target === "/" ? loc.pathname === target : loc.pathname === target || loc.pathname.startsWith(`${target}/`);
  const state = { isActive, isPending: false };
  return (
    <Link
      ref={ref}
      to={to}
      className={typeof className === "function" ? className(state) : className}
      aria-current={isActive ? "page" : undefined}
      {...rest}
    >
      {typeof children === "function" ? children(state) : children}
    </Link>
  );
});
NavLink.displayName = "NavLink";

export type { NavLinkProps };

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}

