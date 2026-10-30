export type Role = "admin" | "manager" | "tech";
export const ROLES: Role[] = ["admin", "manager", "tech"];
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", tech: "Field Tech" };

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  title: string | null;
  color: string;
  role: Role | null;
  active: boolean;
};

export type Invite = {
  email: string;
  role: Role;
  full_name: string;
  phone: string | null;
  title: string | null;
  color: string;
  invited_at: string;
  accepted_at: string | null;
};

export type TeamMember = {
  email: string;
  full_name: string;
  role: Role | null;
  title: string | null;
  phone: string | null;
  color: string;
  profile_id: string | null;
  status: "active" | "invited" | "inactive";
  invited_at: string | null;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};
export type CustomerInput = Omit<Customer, "id" | "created_at" | "updated_at">;
export type CustomerListItem = Customer & { primary_contact: string | null; project_count: number };

export type Contact = {
  id: string;
  customer_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
};
export type ContactInput = Omit<Contact, "id" | "customer_id">;

export type InviteInput = { email: string; role: Role; full_name: string; title: string | null; phone: string | null; color: string };

export type SessionUser = { id: string; email: string; name: string; role: Role | null; color: string; active: boolean };
