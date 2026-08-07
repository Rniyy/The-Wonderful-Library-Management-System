#include <iostream>
#include <fstream>
#include <string>
using namespace std;

struct NodeType {
    int id;
    string name;
    NodeType* next;
};

struct NodeType *p, *ptr, *plist;

void Initialize(NodeType*& plist) {
    plist = NULL;
}

NodeType* GetNode(int id, string name) {
    p = new NodeType;
    p->id = id;
    p->name = name;
    p->next = NULL;
    return (p);
}

void FreeNode(NodeType* p) {
    delete p;
}

NodeType* CreateList(NodeType* plist, int n) {
    NodeType* p;
    NodeType* ptr;
    int id; string name;

    cout << "\nEnter Customer ID: "; cin >> id;
    cout << "Enter Name (no spaces): "; cin >> name;
    p = GetNode(id, name);
    plist = p;
    ptr = plist;

    for (int i = 2; i <= n; i++) {
        cout << "Enter Customer ID: "; cin >> id;
        cout << "Enter Name (no spaces): "; cin >> name;
        p = GetNode(id, name);
        ptr->next = p;
        ptr = p;
    }
    return plist;
}

void Traverse(NodeType* plist) {
    NodeType* p = plist;
    if (p == NULL) { cout << "\n[Traverse] List is empty.\n"; return; }
    cout << "\n[Traverse] Customer List: \n";
    while (p != NULL) {
        cout << p->id << " - " << p->name << "\n";
        p = p->next;
    }
}

int CountNode(NodeType* plist) {
    int num = 0;
    NodeType* p = plist;
    for (; p != NULL; p = p->next)
        num = num + 1;
    return (num);
}

NodeType* SearchPos(NodeType* plist, int id) {
    NodeType* p = plist;
    while (p != NULL) {
        if (p->id == id) return (p);
        else p = p->next;
    }
    return NULL;
}

void SearchNode(NodeType* plist, int id) {
    NodeType* found = SearchPos(plist, id);
    if (found != NULL)
        cout << "\n[Search] Found: " << found->id << " - " << found->name << "\n";
    else
        cout << "\n[Search] Customer ID " << id << " not found.\n";
}

void UpdateNode(NodeType* plist, int id, string newName) {
    NodeType* p = SearchPos(plist, id);
    if (p == NULL) {
        cout << "\n[Update] Customer ID " << id << " not found.\n";
        return;
    }
    p->name = newName;
    cout << "\n[Update] Customer " << id << " updated to \"" << newName << "\".\n";
}

void Sort(NodeType* plist) {
    NodeType* p;
    NodeType* ptr;
    for (p = plist; p != NULL; p = p->next) {
        for (ptr = p->next; ptr != NULL; ptr = ptr->next) {
            if (p->id > ptr->id) {
                swap(p->id, ptr->id);
                swap(p->name, ptr->name);
            }
        }
    }
    cout << "\n[Sort] List sorted by Customer ID.\n";
}

NodeType* InsertNode(NodeType* plist, int id, string name, char ch, int pos) {
    if (SearchPos(plist, id) != NULL) {
        cout << "\n[Insert] Customer ID " << id << " already exists.\n";
        return plist;
    }

    NodeType* p = GetNode(id, name);
    int l = CountNode(plist);

    if (plist == NULL) {
        plist = p;
        cout << "\n[Insert] Inserted " << id << " as the first node.\n";
        return plist;
    }

    if (ch == 'B' || ch == 'b') {
        p->next = plist;
        plist = p;
        cout << "\n[Insert] Inserted " << id << " at Beginning.\n";
    } else if (ch == 'E' || ch == 'e') {
        NodeType* ptr = plist;
        while (ptr->next != NULL) ptr = ptr->next;
        ptr->next = p;
        cout << "\n[Insert] Inserted " << id << " at End.\n";
    } else if (ch == 'A' || ch == 'a') {
        if (pos > l || pos < 1) {
            cout << "\n[Insert] Invalid position.\n";
            FreeNode(p);
        } else {
            int i = 1;
            NodeType* ptr = plist;
            while (i < pos && ptr != NULL) {
                ptr = ptr->next;
                i++;
            }
            if (ptr != NULL) {
                p->next = ptr->next;
                ptr->next = p;
                cout << "\n[Insert] Inserted " << id << " after position " << pos << ".\n";
            }
        }
    }
    return plist;
}

NodeType* DelNode(NodeType* plist, int id) {
    NodeType* p;
    NodeType* p1;
    NodeType* p2;
    NodeType* ptr;

    p = SearchPos(plist, id);
    if (p == NULL) {
        cout << "\n[Delete] Customer ID " << id << " not found.\n";
        return plist;
    }

    if (p == plist) {
        cout << "\nDelete at Beginning.";
        p1 = p;
        plist = p->next;
        FreeNode(p1);
    } else {
        p2 = NULL;
        ptr = plist;
        while (ptr != NULL && ptr->next != p) {
            ptr = ptr->next;
        }
        p2 = ptr;
        if (p->next == NULL) {
            cout << "\nDelete at End.";
            p2->next = NULL;
            FreeNode(p);
        } else {
            cout << "\nDelete at intermediate position.";
            p2->next = p->next;
            FreeNode(p);
        }
    }
    return plist;
}

void WriteToFile(NodeType* plist, const string& filename) {
    ofstream fout(filename.c_str());
    if (!fout.is_open()) {
        cout << "\n[File] Cannot open file for writing: " << filename << "\n";
        return;
    }
    NodeType* p = plist;
    int count = 0;
    while (p != NULL) {
        fout << p->id << " " << p->name << "\n";
        count++;
        p = p->next;
    }
    fout.close();
    cout << "\n[File] Saved " << count << " nodes to \"" << filename << "\".\n";
}

NodeType* ReadFromFile(NodeType*& plst, const string& filename) {
    ifstream fin(filename.c_str());
    if (!fin.is_open()) {
        cout << "\n[File] Cannot open file for reading: " << filename << "\n";
        return plst;
    }
    while (plst != NULL) {
        NodeType* tmp = plst;
        plst = plst->next;
        FreeNode(tmp);
    }
    int id; string name;
    NodeType* tail = NULL;
    int count = 0;
    while (fin >> id >> name) {
        NodeType* p = GetNode(id, name);
        if (plst == NULL) { plst = p; tail = p; }
        else { tail->next = p; tail = p; }
        count++;
    }
    fin.close();
    cout << "\n[File] Loaded " << count << " nodes from \"" << filename << "\".\n";
    return plst;
}

void printMenu() {
    cout << "\n========== CUSTOMER MANAGEMENT (SLL) ==========\n";
    cout << " 1. Create List\n";
    cout << " 2. Traverse (Display)\n";
    cout << " 3. Count Nodes\n";
    cout << " 4. Search Customer\n";
    cout << " 5. Update Customer\n";
    cout << " 6. Sort List\n";
    cout << " 7. Insert Customer\n";
    cout << " 8. Delete Customer\n";
    cout << " 9. Save to File\n";
    cout << " 10. Load from File\n";
    cout << " 0. Exit\n";
    cout << "-------------------------------------------------\n";
    cout << " Enter choice: ";
}

int main() {
    Initialize(plist);
    int choice;
    string filename = "customers.txt";

    do {
        printMenu();
        if (!(cin >> choice)) {
            cout << "\n[Error] Invalid input type. Exiting.\n";
            break;
        }
        switch (choice) {
            case 1: {
                int n;
                cout << "How many customers? ";
                cin >> n;
                if (n <= 0) { cout << "Invalid count.\n"; break; }
                plist = CreateList(plist, n);
                Traverse(plist);
                break;
            }
            case 2:
                Traverse(plist);
                break;
            case 3:
                cout << "\n[Count] Total customers: " << CountNode(plist) << "\n";
                break;
            case 4: {
                int id;
                cout << "Enter Customer ID to search: ";
                cin >> id;
                SearchNode(plist, id);
                break;
            }
            case 5: {
                int id; string newName;
                cout << "Enter Customer ID to update: "; cin >> id;
                cout << "Enter new name: "; cin >> newName;
                UpdateNode(plist, id, newName);
                Traverse(plist);
                break;
            }
            case 6:
                Sort(plist);
                Traverse(plist);
                break;
            case 7: {
                int id; char ch; int pos = 0; string name;
                cout << "Enter Customer ID to insert: "; cin >> id;
                cout << "Enter Name: "; cin >> name;
                cout << "Insert at (B)eginning / (E)nd / (A)fter position: "; cin >> ch;
                if (ch == 'A' || ch == 'a') {
                    cout << "After position #: "; cin >> pos;
                }
                plist = InsertNode(plist, id, name, ch, pos);
                Traverse(plist);
                break;
            }
            case 8: {
                int id;
                cout << "Enter Customer ID to delete: "; cin >> id;
                plist = DelNode(plist, id);
                Traverse(plist);
                break;
            }
            case 9:
                cout << "Enter filename (default: customers.txt): ";
                cin >> filename;
                WriteToFile(plist, filename);
                break;
            case 10:
                cout << "Enter filename to load (default: customers.txt): ";
                cin >> filename;
                plist = ReadFromFile(plist, filename);
                Traverse(plist);
                break;
            case 0:
                cout << "\n[Exit] Goodbye!\n";
                break;
            default:
                cout << "\n[Error] Invalid choice.\n";
        }
    } while (choice != 0);

    while (plist != NULL) {
        NodeType* tmp = plist;
        plist = plist->next;
        FreeNode(tmp);
    }
    return 0;
}