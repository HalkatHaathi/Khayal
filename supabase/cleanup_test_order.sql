-- Removes test order #1001 ("TEST ORDER - delete") and puts its stock back. Safe to run once; does nothing if the order is already gone.
update public.product_sizes ps set stock = ps.stock + i.q
from (select product_id, size, sum(qty)::integer as q from public.order_items
      where order_id = '47e24486-1f2d-4950-a5bf-63099b0ef825' and product_id is not null group by 1, 2) i
where ps.product_id = i.product_id and ps.size = i.size
  and exists (select 1 from public.orders where id = '47e24486-1f2d-4950-a5bf-63099b0ef825' and customer_name = 'TEST ORDER - delete');

delete from public.orders where id = '47e24486-1f2d-4950-a5bf-63099b0ef825' and customer_name = 'TEST ORDER - delete';  -- order_items go with it

-- make the first real order number #1001 again (only if the table is now empty)
do $$ begin
  if not exists (select 1 from public.orders) then alter table public.orders alter column number restart with 1001; end if;
end $$;
