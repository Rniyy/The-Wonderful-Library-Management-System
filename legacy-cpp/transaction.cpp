#include <iostream>
#include <fstream>
#include <string>
using namespace std;

/* =====================  BOOK MANAGEMENT (array, Semester 1 shape) ===================== */
struct Book {
    int id;
    string title;
    bool isIssued;
};
Book books[100];
int bookCount = 0;

int FindBookIndex(int id) {
    for (int i = 0; i < bookCount; i++)
        if (books[i].id == id) return i;
    return -1;
}

void AddBook() {
    if (bookCount >= 100) { cout << "\n[Book] List is full.\n"; return; }
    int id; string title;
    cout << "Book ID: "; cin >> id;
    if (FindBookIndex(id) != -1) { cout << "\n[Book] ID already exists.\n"; return; }
    cout << "Title (no spaces): "; cin >> title;
    books[bookCount].id = id;
    books[bookCount].title = title;
    books[bookCount].isIssued = false;
    bookCount++;
    cout << "\n[Book] Added.\n";
}

void DisplayBooks() {
    if (bookCount == 0) { cout << "\n[Book] No books.\n"; return; }
    for (int i = 0; i < bookCount; i++)
        cout << books[i].id << " - " << books[i].title
             << (books[i].isIssued ? " [Issued]" : " [Available]") << "\n";
}

/* =====================  CUSTOMER MANAGEMENT (linked list, Program 1) ===================== */
struct CustNodeType {
    int id;
    string name;
    CustNodeType* next;
};
struct CustNodeType *custP, *custPtr, *custList;

void InitCustomer(CustNodeType*& plist) { plist = NULL; }

CustNodeType* GetCustNode(int id, string name) {
    custP = new CustNodeType;
    custP->id = id;
    custP->name = name;
    custP->next = NULL;
    return (custP);
}

void FreeCustNode(CustNodeType* p) { delete p; }

CustNodeType* SearchCustomer(CustNodeType* plist, int id) {
    CustNodeType* p = plist;
    while (p != NULL) {
        if (p->id == id) return (p);
        p = p->next;
    }
    return NULL;
}

CustNodeType* InsertCustomer(CustNodeType* plist, int id, string name) {
    if (SearchCustomer(plist, id) != NULL) {
        cout << "\n[Customer] ID " << id << " already exists.\n";
        return plist;
    }
    CustNodeType* p = GetCustNode(id, name);
    if (plist == NULL) { plist = p; return plist; }
    CustNodeType* ptr = plist;
    while (ptr->next != NULL) ptr = ptr->next;
    ptr->next = p;
    return plist;
}

void TraverseCustomer(CustNodeType* plist) {
    if (plist == NULL) { cout << "\n[Customer] No customers.\n"; return; }
    cout << "\n[Traverse] Customer List: \n";
    for (CustNodeType* p = plist; p != NULL; p = p->next)
        cout << p->id << " - " << p->name << "\n";
}

/* =====================  TRANSACTION MANAGEMENT (linked list) ===================== */
struct TransNodeType {
    int bookId;
    int customerId;
    string type;         // "ISSUE" or "RETURN"
    TransNodeType* next;
};
struct TransNodeType *transP, *transPtr, *transList;

// ---------- Initialize ----------
void Initialize(TransNodeType*& plist) {
    plist = NULL;
}

// ---------- GetNode ----------
TransNodeType* GetNode(int bookId, int customerId, string type) {
    transP = new TransNodeType;
    transP->bookId = bookId;
    transP->customerId = customerId;
    transP->type = type;
    transP->next = NULL;
    return (transP);
}

// ---------- FreeNode ----------
void FreeNode(TransNodeType* p) {
    delete p;
}

// ---------- Traverse ----------
void Traverse(TransNodeType* plist) {
    TransNodeType* p = plist;
    if (p == NULL) { cout << "\n[Traverse] No transactions.\n"; return; }
    cout << "\n[Traverse] Transaction History: \n";
    while (p != NULL) {
        cout << p->type << " - Book " << p->bookId << " - Customer " << p->customerId << "\n";
        p = p->next;
    }
}

// ---------- CountNode ----------
int CountNode(TransNodeType* plist) {
    int num = 0;
    for (TransNodeType* p = plist; p != NULL; p = p->next)
        num = num + 1;
    return (num);
}

// ---------- InsertNode ----------
TransNodeType* InsertNode(TransNodeType* plist, int bookId, int customerId, string type) {
    TransNodeType* p = GetNode(bookId, customerId, type);
    if (plist == NULL) { plist = p; return plist; }
    TransNodeType* ptr = plist;
    while (ptr->next != NULL) ptr = ptr->next;
    ptr->next = p;
    return plist;
}

// ---------- Write File ----------
void WriteToFile(TransNodeType* plist, const string& filename) {
    ofstream fout(filename.c_str());
    if (!fout.is_open()) {
        cout << "\n[File] Cannot open file for writing: " << filename << "\n";
        return;
    }
    int count = 0;
    for (TransNodeType* p = plist; p != NULL; p = p->next) {
        fout << p->bookId << " " << p->customerId << " " << p->type << "\n";
        count++;
    }
    fout.close();
    cout << "\n[File] Saved " << count << " transactions to \"" << filename << "\".\n";
}

// ---------- Read File ----------
TransNodeType* ReadFromFile(TransNodeType*& plst, const string& filename) {
    ifstream fin(filename.c_str());
    if (!fin.is_open()) {
        cout << "\n[File] Cannot open file for reading: " << filename << "\n";
        return plst;
    }
    while (plst != NULL) {
        TransNodeType* tmp = plst;
        plst = plst->next;
        FreeNode(tmp);
    }
    int bookId, custId; string type;
    TransNodeType* tail = NULL;
    int count = 0;
    while (fin >> bookId >> custId >> type) {
        TransNodeType* p = GetNode(bookId, custId, type);
        if (plst == NULL) { plst = p; tail = p; }
        else { tail->next = p; tail = p; }
        count++;
    }
    fin.close();
    cout << "\n[File] Loaded " << count << " transactions from \"" << filename << "\".\n";
    return plst;
}

/* =====================  ISSUE / RETURN (ties all 3 modules together) ===================== */
void IssueBook(TransNodeType*& plist) {
    int bookId, custId;
    cout << "Book ID to issue: "; cin >> bookId;
    int idx = FindBookIndex(bookId);
    if (idx == -1) { cout << "\n[Issue] Book not found.\n"; return; }
    if (books[idx].isIssued) { cout << "\n[Issue] Book already issued.\n"; return; }

    cout << "Customer ID: "; cin >> custId;
    if (SearchCustomer(custList, custId) == NULL) { cout << "\n[Issue] Customer not found.\n"; return; }

    books[idx].isIssued = true;
    plist = InsertNode(plist, bookId, custId, "ISSUE");
    cout << "\n[Issue] Book issued.\n";
}

void ReturnBook(TransNodeType*& plist) {
    int bookId, custId;
    cout << "Book ID to return: "; cin >> bookId;
    int idx = FindBookIndex(bookId);
    if (idx == -1) { cout << "\n[Return] Book not found.\n"; return; }
    if (!books[idx].isIssued) { cout << "\n[Return] Book was not issued.\n"; return; }

    cout << "Customer ID: "; cin >> custId;
    books[idx].isIssued = false;
    plist = InsertNode(plist, bookId, custId, "RETURN");
    cout << "\n[Return] Book returned.\n";
}

/* =====================  MENUS  ===================== */
void printBookMenu() {
    cout << "\n---- Book Management (array) ----\n";
    cout << " 1. Add Book\n 2. Display Books\n 0. Back\n Choice: ";
}

void printCustomerMenu() {
    cout << "\n---- Customer Management (linked list) ----\n";
    cout << " 1. Add Customer\n 2. Display Customers\n 0. Back\n Choice: ";
}

void printTransactionMenu() {
    cout << "\n---- Transaction Management (linked list) ----\n";
    cout << " 1. Issue Book\n 2. Return Book\n 3. View Transactions\n";
    cout << " 4. Count Transactions\n 5. Save to File\n 6. Load from File\n 0. Back\n Choice: ";
}

void printMainMenu() {
    cout << "\n========== LIBRARY MANAGEMENT SYSTEM ==========\n";
    cout << " 1. Book Management (array)\n";
    cout << " 2. Customer Management (linked list)\n";
    cout << " 3. Transaction Management (linked list)\n";
    cout << " 0. Exit\n";
    cout << "-------------------------------------------------\n Choice: ";
}

int main() {
    InitCustomer(custList);
    Initialize(transList);

    int choice;
    do {
        printMainMenu();
        if (!(cin >> choice)) { cout << "\n[Error] Invalid input. Exiting.\n"; break; }

        if (choice == 1) {
            int c;
            do {
                printBookMenu();
                cin >> c;
                if (c == 1) AddBook();
                else if (c == 2) DisplayBooks();
            } while (c != 0);
        } else if (choice == 2) {
            int c;
            do {
                printCustomerMenu();
                cin >> c;
                if (c == 1) {
                    int id; string name;
                    cout << "Customer ID: "; cin >> id;
                    cout << "Name (no spaces): "; cin >> name;
                    custList = InsertCustomer(custList, id, name);
                } else if (c == 2) {
                    TraverseCustomer(custList);
                }
            } while (c != 0);
        } else if (choice == 3) {
            int c;
            do {
                printTransactionMenu();
                cin >> c;
                switch (c) {
                    case 1: IssueBook(transList); break;
                    case 2: ReturnBook(transList); break;
                    case 3: Traverse(transList); break;
                    case 4: cout << "\n[Count] Total transactions: " << CountNode(transList) << "\n"; break;
                    case 5: {
                        string filename = "transactions.txt";
                        cout << "Filename (default: transactions.txt): "; cin >> filename;
                        WriteToFile(transList, filename);
                        break;
                    }
                    case 6: {
                        string filename = "transactions.txt";
                        cout << "Filename to load (default: transactions.txt): "; cin >> filename;
                        transList = ReadFromFile(transList, filename);
                        Traverse(transList);
                        break;
                    }
                }
            } while (c != 0);
        } else if (choice == 0) {
            cout << "\n[Exit] Goodbye!\n";
        } else {
            cout << "\n[Error] Invalid choice.\n";
        }
    } while (choice != 0);

    while (custList != NULL) { CustNodeType* t = custList; custList = custList->next; FreeCustNode(t); }
    while (transList != NULL) { TransNodeType* t = transList; transList = transList->next; FreeNode(t); }
    return 0;
}