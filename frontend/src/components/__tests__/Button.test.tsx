import { render, fireEvent } from '@testing-library/react';
import Button from '../../components/Button';

test('renders children and applies className', () => {
  const { getByText } = render(<Button className="custom-class">Click Me</Button>);
  const button = getByText('Click Me');
  expect(button).toBeInTheDocument();
  expect(button).toHaveClass('custom-class');
  expect(button).toHaveClass('btn-ripple');
});

test('calls onClick handler', () => {
  const handleClick = jest.fn();
  const { getByText } = render(<Button onClick={handleClick}>Press</Button>);
  fireEvent.click(getByText('Press'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
