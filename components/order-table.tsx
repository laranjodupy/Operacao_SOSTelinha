"use client";

import { ArrowUpRight } from "lucide-react";

import { money, statusLabels, type Order } from "@/lib/types";
import { Badge } from "./shared";

import { time, date, tone } from "./ui-types";

export function OrderTable({
  orders,
  onSelect,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pedido / Cliente</th>
            <th>Valor</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Abrir pedido</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <button className="table-link" onClick={() => onSelect(o)}>
                  <strong>{o.number}</strong>
                  <small>{o.customerName}</small>
                </button>
              </td>
              <td>
                <strong>{money(o.total)}</strong>
                <small>
                  {date(o.createdAt)} · {time(o.createdAt)}
                </small>
              </td>
              <td>
                <Badge tone={tone(o.status)}>{statusLabels[o.status]}</Badge>
              </td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={`Abrir pedido ${o.number}`}
                  onClick={() => onSelect(o)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
