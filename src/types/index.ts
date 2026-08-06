export type {
  AppUser,
  Batch,
  Branch,
  CreditPayment,
  Customer,
  PaymentMethod,
  Product,
  ProductRequest,
  Purchase,
  Sale,
  StockMovement,
  Supplier,
  UserRole,
} from "@prisma/client";

export type ApiError = {
  error: string;
  status: number;
};
