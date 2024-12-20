Arxiv = {    
    generateAuthors(authors) {
        var newAuthorList = [];
        if (authors) {
            authors.forEach(author => {
                newAuthorList.push(
                    {
                        "firstName": author["given"] || "",
                        "lastName": author["family"] || "",
                        "creatorType": "author"
                    }
                );
            });
        }
        return newAuthorList;
    },

    generateDate(date) {
        if (!date) {
            return null;
        }
        return date.split("T")[0]; // 提取日期部分 (YYYY-MM-DD 格式)
    },

    getMetaData(item) {
        var repository = item.getField('repository');
        if (repository !== "arXiv") {
            return null; // 仅处理 ArXiv 上的文献
        }

        var arxivID = item.getField('archiveID').split(":")[1];
        if (!arxivID) {
            return null; // ArXiv ID 是必需的
        }

        var url = `https://export.arxiv.org/api/query?id_list=${arxivID}`;
        return Utilities.fetchWithTimeout(url, { method: 'GET' }, 3000)
            .then(response => {
                if (!response.ok) {
                    Utilities.publishError("Error retrieving metadata", 
                        "Please check if the ArXiv ID is correct and if you have network access to arxiv.org.");
                    return null;
                }
                return response.text();
            })
            .then(data => {
                try {
                    // 解析 ArXiv API 返回的 XML 数据
                    let parser = new DOMParser();
                    let xmlDoc = parser.parseFromString(data, "application/xml");

                    let title = xmlDoc.querySelector("entry > title")?.textContent.trim();
                    let authors = Array.from(xmlDoc.querySelectorAll("entry > author")).map(author => ({
                        given: author.querySelector("name").textContent.split(" ").slice(0, -1).join(" "),
                        family: author.querySelector("name").textContent.split(" ").slice(-1).join(" ")
                    }));
                    let published = xmlDoc.querySelector("entry > published")?.textContent.trim();
                    let summary = xmlDoc.querySelector("entry > summary")?.textContent.trim();
                    let journalRef = xmlDoc.querySelector("entry > arxiv\\:journal_ref")?.textContent.trim();
                    let doi = xmlDoc.querySelector("entry > arxiv\\:doi")?.textContent.trim();

                    return {
                        "Title": title || "",
                        "Authors": this.generateAuthors(authors),
                        "PublishDate": this.generateDate(published),
                        "Abstract": summary || "",
                        "JournalRef": journalRef || "",
                        "DOI": doi || ""
                    };
                } catch (error) {
                    Utilities.publishError("Error parsing metadata", "Unable to parse metadata from ArXiv.");
                    return null;
                }
            });
    },
      
    async updateMetadata(item) {
        var metaData = await this.getMetaData(item);
        if (!metaData) {
            return 1;
        }

        if (!Utilities.isEmpty(metaData["Title"]))       item.setField('title', metaData["Title"]);
        if (!Utilities.isEmpty(metaData["Authors"]))     item.setCreators(metaData["Authors"]);
        if (!Utilities.isEmpty(metaData["PublishDate"])) item.setField('date', metaData["PublishDate"]);
        if (!Utilities.isEmpty(metaData["Abstract"]))    item.setField('abstractNote', metaData["Abstract"]);
        if (!Utilities.isEmpty(metaData["JournalRef"]))  item.setField('publicationTitle', metaData["JournalRef"]);
        if (!Utilities.isEmpty(metaData["DOI"]))         item.setField('DOI', metaData["DOI"]);
        await item.saveTx();
        return 0;
    }
};