import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (customer === undefined) {
      throw new AppError('This customer does not exist');
    }

    const findProducts = await this.productsRepository.findAllById(products);

    if (findProducts.length === 0) {
      throw new AppError('Could not find any produts with given ids');
    }

    const findProductsIds = findProducts.map((product) => product.id);

    const checkInexistentProducts = products.filter((product) => !findProductsIds.includes(product.id));

    if (checkInexistentProducts.length) {
      throw new AppError(`Could not find product${checkInexistentProducts[0].id}`);
    }

    const findProductsWithNoQuantityAvailable = products.filter((product) => {
      return findProducts.filter((existentProduct) => existentProduct.id === product.id)[0].quantity < product.quantity;
    });

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity ${findProductsWithNoQuantityAvailable[0].quantity} is not available for ${findProductsWithNoQuantityAvailable[0].id}`
      );
    }

    const serializedProducts = products.map((product) => ({
      product_id: product.id,
      quantity: product.quantity,
      price: findProducts.filter((productData) => productData.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });


    const { order_products } = order;

    const orderedProductsQuantity = order_products.map((product) => ({
      id: product.product_id,
      quantity: findProducts.filter((productData) => productData.id === product.product_id)[0].quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
