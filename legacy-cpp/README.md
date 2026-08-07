# Legacy C++ version

The original console implementation, kept for history. `customer.cpp` was a
standalone linked-list customer manager; `transaction.cpp` combined book
(array), customer (linked list), and transaction (linked list) management
into one menu-driven program reading/writing plain `.txt` files.

The active project has been rebuilt as a web app — see the root `README.md`.
Compile these with any C++ compiler if you want to run the old version:

```
g++ -o transaction legacy-cpp/transaction.cpp
./transaction
```
